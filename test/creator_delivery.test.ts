import { describe, expect, it } from "vitest";
import { deliveryDecision } from "../src/creator_delivery.js";

describe("creator delivery decision", () => {
  it("delivers only after media processing reaches ready", () => {
    expect(deliveryDecision("ingested")).toBe("wait");
    expect(deliveryDecision("processing")).toBe("wait");
    expect(deliveryDecision("failed")).toBe("wait");
    expect(deliveryDecision("ready")).toBe("deliver");
  });
});
