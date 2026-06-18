import type { BinaryPosition, BinaryTreeNode, BinaryTreeResponse, ReferralTreeNode, ReferralTreeResponse } from "@/lib/api";
import { Badge, cn } from "@/components/ui";

export type NetworkDisplayNode = {
  key: string;
  accountId: string;
  loginId: string | null;
  displayName: string | null;
  depth: number;
  position: BinaryPosition | null;
  rootLeg: BinaryPosition | null;
  children: NetworkDisplayNode[];
};

export type FlattenedNetworkNode = NetworkDisplayNode & {
  level: number;
};

export function referralTreeToDisplay(tree: ReferralTreeResponse): NetworkDisplayNode {
  return {
    key: tree.root.account_id,
    accountId: tree.root.account_id,
    loginId: tree.root.login_id,
    displayName: tree.root.display_name,
    depth: tree.root.depth,
    position: null,
    rootLeg: null,
    children: tree.children.map(mapReferralNode),
  };
}

export function binaryTreeToDisplay(tree: BinaryTreeResponse): NetworkDisplayNode {
  return mapBinaryNode(tree.root);
}

function mapReferralNode(node: ReferralTreeNode): NetworkDisplayNode {
  return {
    key: node.account_id,
    accountId: node.account_id,
    loginId: node.login_id,
    displayName: node.display_name,
    depth: node.depth,
    position: null,
    rootLeg: null,
    children: node.children.map(mapReferralNode),
  };
}

function mapBinaryNode(node: BinaryTreeNode): NetworkDisplayNode {
  return {
    key: node.account_id,
    accountId: node.account_id,
    loginId: node.login_id,
    displayName: node.display_name,
    depth: node.depth,
    position: node.binary_position,
    rootLeg: node.root_leg,
    children: node.children.map(mapBinaryNode),
  };
}

export function flattenNetworkTree(node: NetworkDisplayNode, level = 0): FlattenedNetworkNode[] {
  return [
    { ...node, level },
    ...node.children.flatMap((child) => flattenNetworkTree(child, level + 1)),
  ];
}

export function NetworkTree({
  node,
  title,
  variant,
}: {
  node: NetworkDisplayNode | null;
  title: string;
  variant: "referral" | "binary";
}) {
  if (!node) {
    return <div className="text-sm text-slate-500">표시할 조직 노드가 없습니다.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-[24px] border border-blue-400/20 bg-blue-500/10 p-4">
        <div className="text-xs uppercase tracking-[0.18em] text-blue-200/80">{title}</div>
        <div className="mt-2 text-base font-semibold text-slate-50">{formatAccountLabel(node.loginId, node.displayName)}</div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge tone="slate">depth {node.depth}</Badge>
          {variant === "binary" ? <Badge tone="slate">{node.position ?? "ROOT"}</Badge> : null}
        </div>
      </div>
      <div className="space-y-3">
        <RecursiveNode node={node} level={0} variant={variant} />
      </div>
    </div>
  );
}

function RecursiveNode({
  node,
  level,
  variant,
}: {
  node: NetworkDisplayNode;
  level: number;
  variant: "referral" | "binary";
}) {
  return (
    <div className="space-y-3" style={{ marginLeft: level * 20 }}>
      <div className="rounded-[24px] border border-slate-800 bg-slate-950/55 p-4 shadow-[0_18px_40px_rgba(2,6,23,0.26)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{variant === "binary" ? "Binary Node" : "Referral Node"}</div>
            <div className="mt-2 text-sm font-semibold text-slate-100">{formatAccountLabel(node.loginId, node.displayName)}</div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-400">
              <Badge tone="slate">depth {node.depth}</Badge>
              {variant === "binary" ? (
                <>
                  <Badge tone={node.position === "LEFT" ? "blue" : node.position === "RIGHT" ? "emerald" : "slate"}>
                    {node.position ?? "ROOT"}
                  </Badge>
                  <Badge tone="slate">root_leg {node.rootLeg ?? "-"}</Badge>
                </>
              ) : null}
            </div>
          </div>
          <div className="font-mono text-xs text-slate-500">{node.accountId.slice(0, 8)}</div>
        </div>
      </div>
      {node.children.length > 0 ? (
        <div className={cn("space-y-3", level === 0 ? "soft-grid rounded-[28px] p-3" : "")}>
          {node.children.map((child) => (
            <RecursiveNode key={child.key} node={child} level={level + 1} variant={variant} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function formatAccountLabel(loginId: string | null, displayName: string | null) {
  if (loginId && displayName) return `${loginId} / ${displayName}`;
  return loginId ?? displayName ?? "이름 없음";
}
