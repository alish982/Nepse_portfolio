import { describe, expect, it } from "vitest";
import { parseCsv, parsePdfText } from "./parse";

const csv = `"S.N","Scrip","Current Balance","Pledge Balance","Lockin Balance","Freeze Balance","Free Balance","Demat Pending","Remarks"
"1","HLI","12.0","0.0","0.0","0.0","12.0","0.0"," "
"2","NABIL","11.0","0.0","0.0","0.0","11.0","0.0"," "
"3","UPPER","174.0","0.0","0.0","0.0","174.0","0.0"," "
`;

describe("parseCsv", () => {
  it("reads a Demat 'My Shares' export and uses Current Balance", () => {
    const r = parseCsv(csv);
    expect(r.rows).toEqual([
      { symbol: "HLI", quantity: 12, price: null },
      { symbol: "NABIL", quantity: 11, price: null },
      { symbol: "UPPER", quantity: 174, price: null },
    ]);
    expect(r.skipped).toEqual([]);
  });

  it("handles CRLF, BOM and semicolon delimiters", () => {
    const r = parseCsv("﻿Symbol;Quantity\r\nnabil;10\r\nNICA;5\r\n");
    expect(r.rows.map((x) => [x.symbol, x.quantity])).toEqual([["NABIL", 10], ["NICA", 5]]);
  });

  it("uses a price column only when the file has one", () => {
    const r = parseCsv("Symbol,Quantity,Avg Cost\nNABIL,10,1,050.50\nNICA,5,700\n".replace("1,050.50", '"1,050.50"'));
    expect(r.rows).toEqual([
      { symbol: "NABIL", quantity: 10, price: 1050.5 },
      { symbol: "NICA", quantity: 5, price: 700 },
    ]);
  });

  it("skips zero balances silently and reports bad rows", () => {
    const r = parseCsv("Scrip,Current Balance\nAAA,0\nBBB,2.5\nC C,3\nDDD,7\n");
    expect(r.rows).toEqual([{ symbol: "DDD", quantity: 7, price: null }]);
    expect(r.skipped).toHaveLength(2);
  });

  it("merges duplicate symbols", () => {
    const r = parseCsv("Scrip,Current Balance\nNABIL,10\nNABIL,5\n");
    expect(r.rows).toEqual([{ symbol: "NABIL", quantity: 15, price: null }]);
  });

  it("rejects a file without the needed columns", () => {
    expect(() => parseCsv("Name,Age\nA,1\n")).toThrow(/Scrip/);
  });
});

describe("parsePdfText", () => {
  const text = `NIC ASIA BANK LIMITED
Summary Statement Of Account
Holder Name : Example Person
BOID : 0000000000000000
S.N. Scrip Current
Balance Pledge
Balance Lockin
Balance Freeze
Balance Free
Balance Demat
Pending Remarks
1. HLI 12.0 0.0 0.0 0.0 12.0 0.0
2. NABIL 11.0 0.0 0.0 0.0 11.0 0.0
10. UPPER 174.0 5.0 0.0 0.0 169.0 0.0 Pledged
`;
  it("extracts scrip and current balance from statement lines only", () => {
    const r = parsePdfText(text);
    expect(r.rows).toEqual([
      { symbol: "HLI", quantity: 12, price: null },
      { symbol: "NABIL", quantity: 11, price: null },
      { symbol: "UPPER", quantity: 174, price: null },
    ]);
  });

  it("does not mistake header or personal lines for holdings", () => {
    expect(() => parsePdfText("Holder Name : A B\nBOID : 1301370001884801\n")).toThrow(/No holdings/);
  });
});
