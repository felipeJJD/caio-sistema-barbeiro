"use client";

import { WhatsappAutomation as WhatsappAutomationCore } from "./whatsapp-automation-core";
import { WhatsappStatusPublications } from "./whatsapp-status-publications";

export function WhatsappAutomation() {
  return <>
    <WhatsappStatusPublications />
    <WhatsappAutomationCore />
  </>;
}
