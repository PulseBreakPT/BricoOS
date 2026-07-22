import { useEffect, useState } from "react";
import BrandMark from "@/components/BrandMark";

function alreadyBooted() {
  try {
    return !!window.sessionStorage.getItem("brico_booted");
  } catch {
    return true;
  }
}

// Sequência de arranque do BRICO OS — aparece uma vez por sessão (e depois
// de bloquear o ecrã), como o login de um sistema operativo real. Curta o
// suficiente para nunca atrapalhar: ~1.6s e desaparece.
export default function BootSplash() {
  const [phase, setPhase] = useState(() => (alreadyBooted() ? "done" : "boot"));

  useEffect(() => {
    if (phase !== "boot") return undefined;
    const fadeTimer = window.setTimeout(() => setPhase("fade"), 1450);
    const doneTimer = window.setTimeout(() => {
      try {
        window.sessionStorage.setItem("brico_booted", "1");
      } catch {
        /* sem sessionStorage */
      }
      setPhase("done");
    }, 1950);
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(doneTimer);
    };
  }, [phase]);

  if (phase === "done") return null;

  return (
    <div
      data-testid="boot-splash"
      aria-hidden="true"
      className={`os-boot-splash fixed inset-0 z-[120] flex flex-col items-center justify-center ${phase === "fade" ? "os-boot-splash-fade" : ""}`}
    >
      <BrandMark className="h-16 w-16 rounded-[20px]" />
      <p className="mt-5 font-heading text-2xl font-black tracking-tight text-neutral-900">
        BRICO OS
      </p>
      <p className="mt-1.5 text-[8px] font-black uppercase tracking-[0.5em] text-neutral-400">
        Operations Workstation
      </p>
      <div className="os-boot-bar mt-8 h-1 w-44 overflow-hidden rounded-full bg-neutral-900/10">
        <span className="os-boot-bar-fill block h-full rounded-full bg-gradient-to-r from-red-500 to-red-700" />
      </div>
      <p className="mt-4 font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-neutral-400">
        A preparar a bancada digital
      </p>
      <p className="absolute bottom-6 font-mono text-[8px] font-bold uppercase tracking-[0.18em] text-neutral-400/70">
        BRICO OS 2.0 · Loja 01
      </p>
    </div>
  );
}
