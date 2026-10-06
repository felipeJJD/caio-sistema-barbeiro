export type AffiliateWorkspaceTab = "prospecting" | "progress" | "settings" | "instagram";
export type AffiliatePortalTab = "Resumo" | "Indicações" | "Gerar links" | "Comissões";

export function affiliateWorkspaceTab(value: string | null): AffiliateWorkspaceTab {
  return value === "progress" || value === "settings" || value === "instagram" ? value : "prospecting";
}

export function affiliatePortalTab(value: string | null): AffiliatePortalTab {
  if (value === "indicacoes") return "Indicações";
  if (value === "links") return "Gerar links";
  if (value === "comissoes") return "Comissões";
  return "Resumo";
}

export function affiliatePortalHref(tab: AffiliatePortalTab) {
  const view = ({ "Resumo": "", "Indicações": "indicacoes", "Gerar links": "links", "Comissões": "comissoes" } as const)[tab];
  return view ? `/afiliado?view=${view}` : "/afiliado";
}

export function affiliateWorkspaceHref(tab: AffiliateWorkspaceTab) {
  return tab === "prospecting" ? "/afiliado/prospeccao" : `/afiliado/prospeccao?tab=${tab}`;
}
