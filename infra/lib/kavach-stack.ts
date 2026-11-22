import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CfnOutput, CfnResource, Duration, RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import * as amplify from "aws-cdk-lib/aws-amplify";
import * as apigw from "aws-cdk-lib/aws-apigateway";
import * as bedrock from "aws-cdk-lib/aws-bedrock";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as kms from "aws-cdk-lib/aws-kms";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subs from "aws-cdk-lib/aws-sns-subscriptions";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import * as tasks from "aws-cdk-lib/aws-stepfunctions-tasks";
import { Construct } from "constructs";
import { REPO_ROOT, loadHarnessConfig, loadSystemPrompt, toCfn } from "./harness-config.js";

const TABLE_KEYS: Record<string, [string, string?]> = {
  households: ["householdId"],
  payees: ["householdId", "payeeId"],
  ledger: ["householdId", "txnId"],
  daily_totals: ["householdId", "date"],
  approvals: ["approvalId"],
  sessions: ["sessionId"],
};

interface JsonSchema {
  type: string;
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
}

// Gateway's SchemaDefinition is JSON Schema with PascalCase keywords; property names stay as written.
function toGatewaySchema(s: JsonSchema): Record<string, unknown> {
  return {
    Type: s.type,
    ...(s.description && { Description: s.description }),
    ...(s.properties && {
      Properties: Object.fromEntries(Object.entries(s.properties).map(([k, v]) => [k, toGatewaySchema(v)])),
    }),
    ...(s.required && { Required: s.required }),
    ...(s.items && { Items: toGatewaySchema(s.items) }),
  };
}

export class KavachStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    const cfg = loadHarnessConfig();
    const lambdasDir = join(REPO_ROOT, "lambdas");

    // ---- Data -------------------------------------------------------------
    const tables: Record<string, dynamodb.TableV2> = {};
    for (const [name, [pk, sk]] of Object.entries(TABLE_KEYS)) {
      tables[name] = new dynamodb.TableV2(this, `Table-${name}`, {
        partitionKey: { name: pk, type: dynamodb.AttributeType.STRING },
        ...(sk && { sortKey: { name: sk, type: dynamodb.AttributeType.STRING } }),
        billing: dynamodb.Billing.onDemand(),
        removalPolicy: RemovalPolicy.DESTROY,
      });
      new CfnOutput(this, `Table${name.replace("_", "")}`, { value: tables[name].tableName });
    }
    const tableEnv = Object.fromEntries(
      Object.entries(tables).map(([name, t]) => [`TABLE_${name.toUpperCase()}`, t.tableName]),
    );

    const approverTopic = new sns.Topic(this, "ApproverTopic", { displayName: "Kavach approver alerts" });
    // The approver's inbox until the approver app exists (Phase 7); tests read it too.
    const approverInbox = new sqs.Queue(this, "ApproverInbox", { retentionPeriod: Duration.days(14) });
    approverTopic.addSubscription(new subs.SqsSubscription(approverInbox, { rawMessageDelivery: true }));

    // ---- L9: signed audit ----------------------------------------------------
    const auditKey = new kms.Key(this, "AuditSigningKey", {
      keySpec: kms.KeySpec.ECC_NIST_P256,
      keyUsage: kms.KeyUsage.SIGN_VERIFY,
      description: "Kavach audit record signing (L9)",
      removalPolicy: RemovalPolicy.RETAIN,
    });
    // Compliance-mode Object Lock: records can't be changed or deleted for 30 days, by anyone.
    const auditBucket = new s3.Bucket(this, "AuditBucket", {
      objectLockEnabled: true,
      objectLockDefaultRetention: s3.ObjectLockRetention.compliance(Duration.days(30)),
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const auditEnv = { AUDIT_BUCKET: auditBucket.bucketName, AUDIT_KEY_ID: auditKey.keyArn };
    const auditWriter = (fn: lambda.Function) => {
      auditKey.grant(fn, "kms:Sign");
      auditBucket.grantPut(fn, "audit/*");
    };

    const pyFn = (id: string, handler: string, timeout: number, env: Record<string, string>, memorySize = 256) =>
      new lambda.Function(this, id, {
        runtime: lambda.Runtime.PYTHON_3_12,
        architecture: lambda.Architecture.ARM_64,
        handler,
        code: lambda.Code.fromAsset(lambdasDir, { exclude: ["**/__pycache__", "**/.gitkeep"] }),
        timeout: Duration.seconds(timeout),
        memorySize,
        environment: env,
        logGroup: new logs.LogGroup(this, `${id}Logs`, {
          retention: logs.RetentionDays.ONE_MONTH,
          removalPolicy: RemovalPolicy.DESTROY,
        }),
      });

    // ---- Tools (behind the Gateway) ---------------------------------------
    // L7: one function and one least-privilege role per tool. Each function
    // serves only its own tool (TOOL_NAME), and only pay_saved_payee can write
    // the ledger or the daily total.
    const read = (...names: string[]) => (fn: lambda.Function) => names.forEach((n) => tables[n].grantReadData(fn));
    const write = (name: string, ...actions: string[]) => (fn: lambda.Function) => tables[name].grant(fn, ...actions);
    const publish = (fn: lambda.Function) => approverTopic.grantPublish(fn);
    const TOOL_GRANTS: Record<string, { target: string; grants: ((fn: lambda.Function) => void)[] }> = {
      list_payees: { target: "payees", grants: [read("sessions", "payees")] },
      lookup_bill: { target: "bills", grants: [read("sessions", "payees"), write("sessions", "dynamodb:UpdateItem")] },
      pay_saved_payee: {
        target: "payments",
        grants: [
          read("sessions", "households", "payees"),
          write("ledger", "dynamodb:PutItem"),
          write("daily_totals", "dynamodb:UpdateItem"),
          auditWriter,
        ],
      },
      // Can ask for an approval (a pending payee, a waiting workflow) but never grant one.
      request_approval: {
        target: "approvals",
        grants: [
          read("sessions", "households", "payees"),
          write("approvals", "dynamodb:PutItem", "dynamodb:UpdateItem"),
          write("payees", "dynamodb:PutItem"),
          (fn) => approvalMachine.grantStartExecution(fn),
          auditWriter,
        ],
      },
      explain_rule: { target: "rules", grants: [read("sessions", "households")] },
      alert_family: { target: "family", grants: [read("sessions"), publish] },
    };

    // ---- L4: before_tool_call gate ----------------------------------------
    const hookToolFn = pyFn("HookToolFn", "hook_tool.handler.lambda_handler", 5, {
      TABLE_SESSIONS: tables.sessions.tableName,
      TABLE_PAYEES: tables.payees.tableName,
      ...auditEnv,
    }, 1024); // hooks sit in every turn's critical path: more memory, more CPU
    read("sessions", "payees")(hookToolFn);
    auditWriter(hookToolFn);

    // ---- L5: AgentCore Policy (Cedar), enforced at the Gateway ------------
    // Policies are generated from rules/*.yaml and the payees table by
    // policy/gen_cedar.py (make policy); with none loaded, every call is denied.
    const policyEngine = new CfnResource(this, "PolicyEngine", {
      type: "AWS::BedrockAgentCore::PolicyEngine",
      properties: { Name: "kavach_policy", Description: "Kavach rules, generated from rules/*.yaml" },
    });
    const policyEngineArn = policyEngine.getAtt("PolicyEngineArn").toString();

    // ---- Gateway -------------------------------------------------------------
    const gatewayRole = new iam.Role(this, "GatewayRole", {
      assumedBy: new iam.ServicePrincipal("bedrock-agentcore.amazonaws.com", {
        conditions: { StringEquals: { "aws:SourceAccount": this.account } },
      }),
    });
    // Its own policy, so the Gateway can depend on exactly this (it is checked
    // when the engine is attached) and not on the role's tool-invoke grants.
    const gatewayPolicyPerms = new iam.Policy(this, "GatewayPolicyEnginePerms", {
      statements: [
        new iam.PolicyStatement({
          sid: "PolicyEngine",
          actions: [
            "bedrock-agentcore:AuthorizeAction",
            "bedrock-agentcore:PartiallyAuthorizeActions",
            "bedrock-agentcore:GetPolicyEngine",
          ],
          // AuthorizeAction is checked against the gateway too; a name pattern
          // avoids a role <-> gateway dependency cycle.
          resources: [
            policyEngineArn,
            `${policyEngineArn}/*`,
            `arn:aws:bedrock-agentcore:${this.region}:${this.account}:gateway/kavach-gateway-*`,
          ],
        }),
      ],
    });
    gatewayRole.attachInlinePolicy(gatewayPolicyPerms);

    const gateway = new CfnResource(this, "Gateway", {
      type: "AWS::BedrockAgentCore::Gateway",
      properties: {
        Name: "kavach-gateway",
        Description: "Kavach payment tools",
        AuthorizerType: "AWS_IAM",
        ProtocolType: "MCP",
        RoleArn: gatewayRole.roleArn,
        PolicyEngineConfiguration: { Arn: policyEngineArn, Mode: "ENFORCE" },
      },
    });
    gateway.node.addDependency(gatewayPolicyPerms);
    const gatewayArn = gateway.getAtt("GatewayArn").toString();

    // The two identities Cedar lets call the Gateway.
    const harnessRole = new iam.Role(this, "HarnessRole", {
      assumedBy: new iam.ServicePrincipal("bedrock-agentcore.amazonaws.com", {
        conditions: { StringEquals: { "aws:SourceAccount": this.account } },
      }),
    });
    // C3 benchmark: a stand-in for a fully hijacked model that calls the
    // Gateway directly, skipping the model and L4, to prove L5-L7 hold alone.
    const benchRole = new iam.Role(this, "BenchRole", {
      roleName: "KavachBench",
      assumedBy: new iam.AccountPrincipal(this.account),
      description: "Kavach C3: scripted malicious tool calls straight to the Gateway",
    });
    const cedarPrincipals = [harnessRole, benchRole]
      .map((r) => `arn:aws:sts::${this.account}:assumed-role/${r.roleName}`)
      .join(",");

    // ---- L8: human approval workflow -----------------------------------------
    const workflowFn = pyFn("ApprovalWorkflowFn", "approvals.handler.workflow_handler", 300, {
      ...tableEnv,
      ...auditEnv,
      APPROVER_TOPIC_ARN: approverTopic.topicArn,
      GATEWAY_ARN: gatewayArn,
      POLICY_ENGINE_ID: policyEngine.getAtt("PolicyEngineId").toString(),
      CEDAR_PRINCIPALS: cedarPrincipals,
    });
    read("households", "payees", "approvals")(workflowFn);
    write("approvals", "dynamodb:UpdateItem")(workflowFn);
    write("payees", "dynamodb:UpdateItem")(workflowFn);
    write("ledger", "dynamodb:PutItem")(workflowFn);
    write("daily_totals", "dynamodb:UpdateItem")(workflowFn);
    publish(workflowFn);
    auditWriter(workflowFn);
    // Re-syncs the household's Cedar allowlist when a payee becomes active.
    workflowFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "bedrock-agentcore:ListPolicies",
          "bedrock-agentcore:GetPolicy",
          "bedrock-agentcore:CreatePolicy",
          "bedrock-agentcore:UpdatePolicy",
        ],
        resources: [policyEngineArn, `${policyEngineArn}/*`],
      }),
    );
    workflowFn.addToRolePolicy(new iam.PolicyStatement({ actions: ["bedrock-agentcore:InvokeGateway"], resources: [gatewayArn] }));

    const step = (id: string, action: string, extra: Record<string, unknown> = {}) =>
      new tasks.LambdaInvoke(this, id, {
        lambdaFunction: workflowFn,
        payload: sfn.TaskInput.fromObject({ action, approvalId: sfn.JsonPath.stringAt("$.approvalId"), ...extra }),
        resultPath: sfn.JsonPath.DISCARD,
      });
    const awaitDecision = new tasks.LambdaInvoke(this, "AwaitApproverDecision", {
      lambdaFunction: workflowFn,
      integrationPattern: sfn.IntegrationPattern.WAIT_FOR_TASK_TOKEN,
      payload: sfn.TaskInput.fromObject({
        action: "await",
        approvalId: sfn.JsonPath.stringAt("$.approvalId"),
        taskToken: sfn.JsonPath.taskToken,
      }),
      resultPath: "$.decision",
      taskTimeout: sfn.Timeout.duration(Duration.hours(72)),
    });
    awaitDecision.addCatch(step("Expire", "reject", { why: "expired" }).next(new sfn.Succeed(this, "Expired")), {
      errors: ["States.Timeout"],
      resultPath: "$.error",
    });
    const cooling = new sfn.Wait(this, "CoolingPeriod", { time: sfn.WaitTime.timestampPath("$.coolingEndsAt") });
    cooling.next(step("Complete", "complete")).next(new sfn.Succeed(this, "Done"));
    awaitDecision.next(
      new sfn.Choice(this, "Approved?")
        .when(sfn.Condition.booleanEquals("$.decision.approved", true), cooling)
        .otherwise(step("Reject", "reject", { why: "rejected" }).next(new sfn.Succeed(this, "Rejected"))),
    );
    const approvalMachine = new sfn.StateMachine(this, "ApprovalWorkflow", {
      definitionBody: sfn.DefinitionBody.fromChainable(
        new sfn.Choice(this, "NeedsApprover?")
          .when(sfn.Condition.booleanEquals("$.needsApprover", true), awaitDecision)
          .otherwise(cooling),
      ),
      timeout: Duration.days(4),
      logs: {
        destination: new logs.LogGroup(this, "ApprovalWorkflowLogs", {
          retention: logs.RetentionDays.ONE_MONTH,
          removalPolicy: RemovalPolicy.DESTROY,
        }),
        level: sfn.LogLevel.ERROR,
      },
    });

    // The approver's decision: the only way to resume a waiting workflow.
    const approverFn = pyFn("ApproverDecisionFn", "approvals.handler.approver_handler", 15, { ...tableEnv, ...auditEnv });
    read("households", "approvals")(approverFn);
    write("approvals", "dynamodb:UpdateItem")(approverFn);
    auditWriter(approverFn);
    approverFn.addToRolePolicy(
      new iam.PolicyStatement({ actions: ["states:SendTaskSuccess", "states:SendTaskFailure"], resources: [approvalMachine.stateMachineArn] }),
    );

    // ---- L2 + L3: before_invocation hook ----------------------------------------
    const guardrailCfg: {
      topics: { name: string; definition: string; examples: string[] }[];
      piiEntities: string[];
      regexes: { name: string; description: string; pattern: string }[];
    } = JSON.parse(readFileSync(join(REPO_ROOT, "policy", "guardrail.generated.json"), "utf8"));
    const guardrail = new bedrock.CfnGuardrail(this, "Guardrail", {
      name: "kavach-guardrail",
      description: "Kavach L2, generated from rules/*.yaml",
      blockedInputMessaging: "Kavach can't help with this request.",
      blockedOutputsMessaging: "Kavach can't help with this request.",
      // Standard tier: better multilingual (Hindi, Tamil) coverage, via cross-region inference.
      crossRegionConfig: {
        guardrailProfileArn: `arn:aws:bedrock:${this.region}:${this.account}:guardrail-profile/us.guardrail.v1:0`,
      },
      topicPolicyConfig: {
        topicsTierConfig: { tierName: "STANDARD" },
        topicsConfig: guardrailCfg.topics.map((t) => ({
          name: t.name,
          definition: t.definition,
          examples: t.examples,
          type: "DENY",
        })),
      },
      contentPolicyConfig: {
        contentFiltersTierConfig: { tierName: "STANDARD" },
        filtersConfig: [{ type: "PROMPT_ATTACK", inputStrength: "HIGH", outputStrength: "NONE" }],
      },
      sensitiveInformationPolicyConfig: {
        piiEntitiesConfig: guardrailCfg.piiEntities.map((type) => ({ type, action: "NONE" })),
        regexesConfig: guardrailCfg.regexes.map((r) => ({ ...r, action: "NONE" })),
      },
    });
    const guardrailVersion = new bedrock.CfnGuardrailVersion(this, "GuardrailVersion", {
      guardrailIdentifier: guardrail.attrGuardrailId,
      // A new version whenever the generated config changes.
      description: `config ${createHash("sha256").update(JSON.stringify(guardrailCfg)).digest("hex").slice(0, 12)}`,
    });

    const hookInvocationFn = pyFn("HookInvocationFn", "hook_invocation.handler.lambda_handler", 10, {
      TABLE_SESSIONS: tables.sessions.tableName,
      TABLE_HOUSEHOLDS: tables.households.tableName,
      GUARDRAIL_ID: guardrail.attrGuardrailId,
      GUARDRAIL_VERSION: guardrailVersion.attrVersion,
      CLASSIFIER_MODEL_ID: cfg.classifierModelId,
      APPROVER_TOPIC_ARN: approverTopic.topicArn,
      ...auditEnv,
    }, 1024);
    read("sessions", "households")(hookInvocationFn);
    write("sessions", "dynamodb:UpdateItem")(hookInvocationFn);
    publish(hookInvocationFn);
    auditWriter(hookInvocationFn);
    hookInvocationFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:ApplyGuardrail"],
        resources: [
          guardrail.attrGuardrailArn,
          `arn:aws:bedrock:*:${this.account}:guardrail/*`,
          `arn:aws:bedrock:*:${this.account}:guardrail-profile/us.guardrail.v1:0`,
        ],
      }),
    );
    hookInvocationFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel"],
        resources: [
          "arn:aws:bedrock:*::foundation-model/amazon.nova-micro-v1:0",
          `arn:aws:bedrock:${this.region}:${this.account}:inference-profile/${cfg.classifierModelId}`,
        ],
      }),
    );

    const toolSchema: { name: string; description: string; inputSchema: JsonSchema }[] = JSON.parse(
      readFileSync(join(lambdasDir, "tools", "schema.json"), "utf8"),
    );
    const targets: CfnResource[] = [];
    for (const t of toolSchema) {
      const spec = TOOL_GRANTS[t.name];
      if (!spec) throw new Error(`no grants defined for tool ${t.name}`);
      const id = t.name.replace(/(^|_)(\w)/g, (_, __, c: string) => c.toUpperCase());
      const fn = pyFn(`Tool${id}Fn`, "tools.handler.lambda_handler", 15, {
        ...tableEnv,
        TOOL_NAME: t.name,
        ...auditEnv,
        ...(spec.grants.includes(publish) && { APPROVER_TOPIC_ARN: approverTopic.topicArn }),
        ...(t.name === "request_approval" && { APPROVAL_STATE_MACHINE_ARN: approvalMachine.stateMachineArn }),
      });
      spec.grants.forEach((g) => g(fn));
      fn.grantInvoke(gatewayRole);

      const target = new CfnResource(this, `GatewayTarget${id}`, {
        type: "AWS::BedrockAgentCore::GatewayTarget",
        properties: {
          GatewayIdentifier: gateway.getAtt("GatewayIdentifier").toString(),
          Name: spec.target,
          Description: t.description.slice(0, 200),
          TargetConfiguration: {
            Mcp: {
              Lambda: {
                LambdaArn: fn.functionArn,
                ToolSchema: {
                  InlinePayload: [
                    { Name: t.name, Description: t.description, InputSchema: toGatewaySchema(t.inputSchema) },
                  ],
                },
              },
            },
          },
          CredentialProviderConfigurations: [{ CredentialProviderType: "GATEWAY_IAM_ROLE" }],
        },
      });
      target.node.addDependency(gatewayRole);
      targets.push(target);
    }

    benchRole.addToPolicy(
      new iam.PolicyStatement({ actions: ["bedrock-agentcore:InvokeGateway"], resources: [gatewayArn] }),
    );

    // ---- Harness ------------------------------------------------------------
    harnessRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "BedrockModelInvocation",
        actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
        resources: [
          "arn:aws:bedrock:*::foundation-model/amazon.nova-*",
          `arn:aws:bedrock:${this.region}:${this.account}:inference-profile/*`,
        ],
      }),
    );
    // The harness provisions managed memory for session history by default.
    harnessRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "HarnessMemory",
        actions: [
          "bedrock-agentcore:CreateEvent",
          "bedrock-agentcore:GetEvent",
          "bedrock-agentcore:ListEvents",
          "bedrock-agentcore:ListSessions",
          "bedrock-agentcore:RetrieveMemoryRecords",
          "bedrock-agentcore:ListMemoryRecords",
          "bedrock-agentcore:GetMemoryRecord",
        ],
        resources: [`arn:aws:bedrock-agentcore:${this.region}:${this.account}:memory/*`],
      }),
    );
    harnessRole.addToPolicy(
      new iam.PolicyStatement({ sid: "InvokeGateway", actions: ["bedrock-agentcore:InvokeGateway"], resources: [gatewayArn] }),
    );
    harnessRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "InvokeLifecycleHookLambda",
        actions: ["lambda:InvokeFunction"],
        resources: [hookToolFn.functionArn, hookInvocationFn.functionArn],
      }),
    );
    harnessRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "Logs",
        actions: ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents", "logs:DescribeLogStreams"],
        resources: [`arn:aws:logs:${this.region}:${this.account}:log-group:/aws/bedrock-agentcore/*`],
      }),
    );

    const harness = new CfnResource(this, "Harness", {
      type: "AWS::BedrockAgentCore::Harness",
      properties: toCfn({
        harnessName: cfg.harnessName,
        executionRoleArn: harnessRole.roleArn,
        model: cfg.model,
        systemPrompt: [{ text: loadSystemPrompt() }],
        tools: [
          {
            type: "agentcore_gateway",
            name: "kavach_tools",
            config: { agentCoreGateway: { gatewayArn, outboundAuth: { awsIam: {} } } },
          },
        ],
        allowedTools: cfg.allowedTools,
        // No harness memory: the session's own turns still carry over, but nothing outlives the
        // session. The default managed memory kept long-term "facts" under one shared actor,
        // which leaked one household's scam call into other sessions (docs/what-broke.md).
        memory: { disabled: {} },
        hooks: [
          {
            beforeInvocation: {
              name: "kavach_coercion_check",
              target: { lambda: { arn: hookInvocationFn.functionArn, timeoutSeconds: 10, failureMode: "deny" } },
            },
          },
          {
            beforeToolCall: {
              name: "kavach_tool_gate",
              target: { lambda: { arn: hookToolFn.functionArn, timeoutSeconds: 5, failureMode: "deny" } },
            },
          },
        ],
        maxIterations: cfg.maxIterations,
        timeoutSeconds: cfg.timeoutSeconds,
      }) as Record<string, unknown>,
    });
    harness.node.addDependency(harnessRole, ...targets);

    // ---- Benchmark baseline (C0/C1): same model, rules only in the prompt ----------------
    // Typical unguarded tools (pay any UPI ID, add payees), run by the bench client against an
    // in-memory ledger. No hooks, no Gateway, no Cedar: what most agents do.
    const baselineTools: { name: string; description: string; inputSchema: object }[] = JSON.parse(
      readFileSync(join(REPO_ROOT, "bench", "baseline_tools.json"), "utf8"),
    );
    const baselineRole = new iam.Role(this, "BaselineHarnessRole", {
      assumedBy: new iam.ServicePrincipal("bedrock-agentcore.amazonaws.com", {
        conditions: { StringEquals: { "aws:SourceAccount": this.account } },
      }),
    });
    baselineRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
        resources: [
          "arn:aws:bedrock:*::foundation-model/amazon.nova-*",
          `arn:aws:bedrock:${this.region}:${this.account}:inference-profile/*`,
        ],
      }),
    );
    baselineRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "bedrock-agentcore:CreateEvent",
          "bedrock-agentcore:GetEvent",
          "bedrock-agentcore:ListEvents",
          "bedrock-agentcore:ListSessions",
          "bedrock-agentcore:RetrieveMemoryRecords",
          "bedrock-agentcore:ListMemoryRecords",
          "bedrock-agentcore:GetMemoryRecord",
        ],
        resources: [`arn:aws:bedrock-agentcore:${this.region}:${this.account}:memory/*`],
      }),
    );
    baselineRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents", "logs:DescribeLogStreams"],
        resources: [`arn:aws:logs:${this.region}:${this.account}:log-group:/aws/bedrock-agentcore/*`],
      }),
    );
    const baseline = new CfnResource(this, "BaselineHarness", {
      type: "AWS::BedrockAgentCore::Harness",
      properties: toCfn({
        harnessName: "kavach_baseline",
        executionRoleArn: baselineRole.roleArn,
        model: cfg.model,
        systemPrompt: [{ text: loadSystemPrompt() }],
        tools: baselineTools.map((t) => ({
          type: "inline_function",
          name: t.name,
          config: { inlineFunction: { description: t.description, inputSchema: t.inputSchema } },
        })),
        allowedTools: baselineTools.map((t) => `@${t.name}`),
        memory: { disabled: {} },
        maxIterations: cfg.maxIterations,
        timeoutSeconds: cfg.timeoutSeconds,
      }) as Record<string, unknown>,
    });
    baseline.node.addDependency(baselineRole);
    new CfnOutput(this, "BaselineHarnessArn", { value: baseline.getAtt("Arn").toString() });

    // ---- Apps API (Phase 7): Cognito sign-in, one Lambda, API Gateway --------------------
    const userPool = new cognito.UserPool(this, "Users", {
      selfSignUpEnabled: false, // demo users are created by scripts/demo_users.py
      signInAliases: { username: true },
      customAttributes: { householdId: new cognito.StringAttribute({ mutable: false, maxLen: 40 }) },
      passwordPolicy: { minLength: 12, requireSymbols: false },
      removalPolicy: RemovalPolicy.DESTROY,
    });
    for (const g of ["senior", "approver", "judge"]) {
      new cognito.CfnUserPoolGroup(this, `Group-${g}`, { userPoolId: userPool.userPoolId, groupName: g });
    }
    const webClient = userPool.addClient("Web", {
      authFlows: { userSrp: true, userPassword: true },
      readAttributes: new cognito.ClientAttributes().withStandardAttributes({}).withCustomAttributes("householdId"),
      writeAttributes: new cognito.ClientAttributes(),
      accessTokenValidity: Duration.hours(8),
      idTokenValidity: Duration.hours(8),
    });

    const apiFn = pyFn("ApiFn", "api.handler.lambda_handler", 29, {
      ...tableEnv,
      ...auditEnv,
      HARNESS_ARN: harness.getAtt("Arn").toString(),
      APPROVER_FN: approverFn.functionName,
    }, 1024);
    read("households", "payees", "ledger", "approvals")(apiFn);
    tables.sessions.grantReadWriteData(apiFn);
    auditBucket.grantRead(apiFn, "audit/*");
    auditKey.grant(apiFn, "kms:Verify");
    approverFn.grantInvoke(apiFn);
    apiFn.addToRolePolicy(
      // InvokeHarness is authorised as InvokeAgentRuntime (docs/what-broke.md).
      new iam.PolicyStatement({
        actions: ["bedrock-agentcore:InvokeAgentRuntime", "bedrock-agentcore:InvokeHarness"],
        resources: [harness.getAtt("Arn").toString(), `${harness.getAtt("Arn").toString()}/*`],
      }),
    );

    const api = new apigw.RestApi(this, "AppsApi", {
      restApiName: "kavach-apps",
      deployOptions: { stageName: "v1", throttlingRateLimit: 5, throttlingBurstLimit: 10 },
      defaultCorsPreflightOptions: {
        allowOrigins: apigw.Cors.ALL_ORIGINS,
        allowHeaders: ["Content-Type", "Authorization"],
        allowMethods: ["GET", "POST", "OPTIONS"],
      },
    });
    // Errors from the authorizer also need CORS headers, or the browser hides them.
    for (const type of [apigw.ResponseType.DEFAULT_4XX, apigw.ResponseType.DEFAULT_5XX]) {
      api.addGatewayResponse(`Cors${type.responseType}`, { type, responseHeaders: { "Access-Control-Allow-Origin": "'*'" } });
    }
    const authorizer = new apigw.CognitoUserPoolsAuthorizer(this, "AppsAuthorizer", { cognitoUserPools: [userPool] });
    const integration = new apigw.LambdaIntegration(apiFn);
    const authed = { authorizer, authorizationType: apigw.AuthorizationType.COGNITO };
    api.root.addResource("session").addMethod("POST", integration, authed);
    api.root.addResource("chat").addMethod("POST", integration, authed);
    api.root.addResource("activity").addMethod("GET", integration, authed);
    api.root.addResource("rules").addMethod("GET", integration, authed);
    api.root.addResource("approvals").addResource("{id}").addMethod("POST", integration, authed);
    api.root.addResource("audit").addResource("{txnId}").addMethod("GET", integration, authed);

    // Public demo: the same routes under /demo with no sign-in. The handler fixes the identity to the
    // two demo households and caps model turns per day (DEMO_DAILY_TURNS); stage throttling still applies.
    const demo = api.root.addResource("demo");
    demo.addResource("session").addMethod("POST", integration);
    demo.addResource("chat").addMethod("POST", integration);
    demo.addResource("activity").addMethod("GET", integration);
    demo.addResource("rules").addMethod("GET", integration);
    demo.addResource("approvals").addResource("{id}").addMethod("POST", integration);
    demo.addResource("audit").addResource("{txnId}").addMethod("GET", integration);

    // Static web app (web/out), uploaded by scripts/build_web.py as a manual Amplify deployment.
    const webApp = new amplify.CfnApp(this, "WebApp", {
      name: "kavach-web",
      platform: "WEB",
      customRules: [{ source: "/<*>", target: "/404.html", status: "404-200" }],
    });
    const webBranch = new amplify.CfnBranch(this, "WebBranch", { appId: webApp.attrAppId, branchName: "main", stage: "PRODUCTION" });
    new CfnOutput(this, "WebAppId", { value: webApp.attrAppId });
    new CfnOutput(this, "WebUrl", { value: `https://${webBranch.branchName}.${webApp.attrDefaultDomain}` });

    new CfnOutput(this, "ApiUrl", { value: api.url });
    new CfnOutput(this, "UserPoolId", { value: userPool.userPoolId });
    new CfnOutput(this, "UserPoolClientId", { value: webClient.userPoolClientId });

    new CfnOutput(this, "HarnessArn", { value: harness.getAtt("Arn").toString() });
    new CfnOutput(this, "GatewayArn", { value: gatewayArn });
    new CfnOutput(this, "ApproverTopicArn", { value: approverTopic.topicArn });
    new CfnOutput(this, "GatewayUrl", { value: gateway.getAtt("GatewayUrl").toString() });
    new CfnOutput(this, "PolicyEngineId", { value: policyEngine.getAtt("PolicyEngineId").toString() });
    new CfnOutput(this, "AccountId", { value: this.account });
    new CfnOutput(this, "HarnessRoleName", { value: harnessRole.roleName });
    new CfnOutput(this, "BenchRoleArn", { value: benchRole.roleArn });
    new CfnOutput(this, "BenchRoleName", { value: benchRole.roleName });
    new CfnOutput(this, "HookToolFnName", { value: hookToolFn.functionName });
    new CfnOutput(this, "HookToolLogGroup", { value: hookToolFn.logGroup.logGroupName });
    new CfnOutput(this, "HookInvocationLogGroup", { value: hookInvocationFn.logGroup.logGroupName });
    new CfnOutput(this, "ApprovalStateMachineArn", { value: approvalMachine.stateMachineArn });
    new CfnOutput(this, "ApprovalWorkflowFnName", { value: workflowFn.functionName });
    new CfnOutput(this, "ApproverDecisionFnName", { value: approverFn.functionName });
    new CfnOutput(this, "ApproverInboxUrl", { value: approverInbox.queueUrl });
    new CfnOutput(this, "AuditBucketName", { value: auditBucket.bucketName });
    new CfnOutput(this, "AuditKeyArn", { value: auditKey.keyArn });
    new CfnOutput(this, "GuardrailId", { value: guardrail.attrGuardrailId });
  }
}
