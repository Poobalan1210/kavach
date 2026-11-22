"use client";

import { useEffect, useState } from "react";

// The live demo needs no sign-in: every visitor can be Kamala, Priya, Arjun or a judge, and the
// API's /demo routes keep them inside the two demo households with a daily cap on model turns.
export type Household = "hh-kamala" | "hh-priya";

/** The household in the URL (`?household=hh-priya`), Kamala's by default. */
export function useHousehold(): Household {
  const [household, setHousehold] = useState<Household>("hh-kamala");
  useEffect(() => {
    const h = new URLSearchParams(window.location.search).get("household");
    if (h === "hh-priya") setHousehold(h);
  }, []);
  return household;
}
