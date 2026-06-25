import { describe, it, expect } from "vitest";
import { tryParseJson, isRecord } from "../../src/research-orchestrator/utils/json";

describe("tryParseJson", () => {
  it("parses valid JSON objects", () => {
    expect(tryParseJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("parses valid JSON arrays", () => {
    expect(tryParseJson("[1,2,3]")).toEqual([1, 2, 3]);
  });

  it("parses primitives", () => {
    expect(tryParseJson("42")).toBe(42);
    expect(tryParseJson('"hello"')).toBe("hello");
    expect(tryParseJson("true")).toBe(true);
    expect(tryParseJson("null")).toBe(null);
  });

  it("returns null for invalid JSON", () => {
    expect(tryParseJson("not json")).toBe(null);
    expect(tryParseJson("{broken")).toBe(null);
    expect(tryParseJson("")).toBe(null);
  });

  it("returns null for undefined-like inputs", () => {
    expect(tryParseJson("undefined")).toBe(null);
  });
});

describe("isRecord", () => {
  it("returns true for plain objects", () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
    expect(isRecord(Object.create(null))).toBe(true);
  });

  it("returns false for arrays", () => {
    expect(isRecord([])).toBe(false);
    expect(isRecord([1, 2, 3])).toBe(false);
  });

  it("returns false for null", () => {
    expect(isRecord(null)).toBe(false);
  });

  it("returns false for primitives", () => {
    expect(isRecord(42)).toBe(false);
    expect(isRecord("hello")).toBe(false);
    expect(isRecord(true)).toBe(false);
    expect(isRecord(undefined)).toBe(false);
  });

  it("returns false for functions", () => {
    expect(isRecord(() => {})).toBe(false);
  });

  it("returns true for class instances (Object whose [[Class]] is not Array)", () => {
    // Note: isRecord intentionally returns true for class instances (Date,
    // Map, etc.). It only excludes arrays and null. The test name documents
    // this contract so future refactors don't accidentally narrow it without
    // auditing call sites.
    expect(isRecord(new Date())).toBe(true);
    expect(isRecord(new Map())).toBe(true);
    expect(isRecord(new Set())).toBe(true);
  });
});
