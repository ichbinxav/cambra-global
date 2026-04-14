import { useEffect } from "react";

export default function DomDump({ tag = "PAGE" }) {
  useEffect(() => {
    try {
      const html = document?.documentElement?.outerHTML || "";
      console.log(`DOM_DUMP_START:${tag}`);
      console.log(html);
      console.log(`DOM_DUMP_END:${tag}`);
    } catch (e) {
      console.error("DOM_DUMP_ERROR", e?.message || e);
    }
  }, [tag]);
  return null;
}