import { App } from "aws-cdk-lib";
import { KavachStack } from "../lib/kavach-stack.js";

const app = new App();
const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: "us-east-1" };

new KavachStack(app, "Kavach", { env });
