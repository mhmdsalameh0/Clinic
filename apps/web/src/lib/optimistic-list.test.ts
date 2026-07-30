import { describe, expect, it } from "vitest";
import { prependItem, removeItem, replaceItem } from "./optimistic-list";

describe("optimistic list helpers", () => {
  it("creates, updates, and deletes without duplicating ids", () => {
    const original = [{ id: "a", name: "A" }, { id: "b", name: "B" }];
    const created = prependItem(original, { id: "b", name: "B2" });
    expect(created).toEqual([{ id: "b", name: "B2" }, { id: "a", name: "A" }]);

    expect(replaceItem(created, { id: "a", name: "A2" })).toEqual([{ id: "b", name: "B2" }, { id: "a", name: "A2" }]);
    expect(removeItem(created, "b")).toEqual([{ id: "a", name: "A" }]);
  });
});
