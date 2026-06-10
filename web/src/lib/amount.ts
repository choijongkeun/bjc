export function formatBaseAmount(amountBase: string, decimals: number, fractionDigits = 4): string {
  if (!/^-?\d+$/.test(amountBase)) {
    return amountBase;
  }

  const negative = amountBase.startsWith("-");
  const digits = negative ? amountBase.slice(1) : amountBase;
  const safeDecimals = Math.max(0, decimals);

  if (safeDecimals === 0) {
    return `${negative ? "-" : ""}${BigInt(digits).toLocaleString("ko-KR")}`;
  }

  const padded = digits.padStart(safeDecimals + 1, "0");
  const integerPart = padded.slice(0, -safeDecimals);
  const decimalPart = padded.slice(-safeDecimals).replace(/0+$/, "").slice(0, fractionDigits);
  return `${negative ? "-" : ""}${BigInt(integerPart || "0").toLocaleString("ko-KR")}${decimalPart ? `.${decimalPart}` : ""}`;
}

export function formatTokenAmount(amountBase: string, decimals: number, symbol: string): string {
  return `${formatBaseAmount(amountBase, decimals)} ${symbol}`;
}
