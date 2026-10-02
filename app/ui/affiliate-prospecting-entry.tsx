import Link from "next/link";
import styles from "./affiliate-prospecting-entry.module.css";

export function AffiliateProspectingEntry() {
  return <Link className={styles.entry} href="/afiliado/prospeccao" aria-label="Abrir Prospecção">Prospecção <b>→</b></Link>;
}
