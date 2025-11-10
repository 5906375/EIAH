import React from "react";

export default function CardEIAHBuilder({
    
    agentImage = "/assets/agent_builder.png" // caminho da imagem do robô
}) {
    return (
        <section
            className="
        relative
        flex flex-col lg:flex-row
        rounded-2xl
        border border-cyan-800/40
        bg-[radial-gradient(circle_at_20%_20%,rgba(10,20,40,0.9)_0%,rgba(2,6,12,0.95)_60%,rgba(0,0,0,1)_100%)]
        text-white
        p-6 lg:p-8
        shadow-[0_40px_120px_rgba(0,0,0,0.9)]
        max-w-[800px]
        w-full
        overflow-hidden
      "
        >
            {/* Borda curva sutil no canto superior esquerdo (detalhe visual) */}
            <div
                className="
          pointer-events-none
          absolute inset-0 rounded-2xl
          ring-1 ring-cyan-500/10
        "
                aria-hidden="true"
            />

            {/* Coluna esquerda: badge, título, descrição, CTA */}
            <div className="flex-1 relative z-10 max-w-xl">
                {/* Badge EIAH_Builder */}
                <div
                    className="
            inline-flex
            items-center
            rounded-xl
            bg-cyan-900/40
            border border-cyan-700/50
            px-3 py-1.5
            mb-5
            shadow-[0_20px_60px_rgba(0,255,255,0.15)]
          "
                >
                    <span
                        className="
              text-[13px] font-medium
              tracking-[0.08em]
              text-cyan-300
              leading-none
            "
                    >
                        EIAH Agente
                    </span>
                </div>

                {/* Título principal */}
                <h1
                    className="
            text-[1.75rem] leading-[2.1rem]
            sm:text-[2rem] sm:leading-[2.3rem]
            font-semibold
            text-white
            drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]
          "
                >
                    Arquitetura Agentic <br className="hidden sm:block" /> Multi-Tenant
                </h1>

                {/* Texto descritivo */}
                <p
                    className="
            mt-5
            text-[1rem] leading-[1.6rem]
            text-slate-300
            max-w-[36ch]
            font-normal
            drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]
          "
                >
                    Orquestre agentes com memória.
                    Diagnóstico completo da arquitetura.
                </p>

                {/* CTA */}
                <button
                    onClick={onInteract}
                    className="
            group
            mt-8
            text-left
            text-[0.95rem] leading-[1.4rem]
            font-semibold tracking-wide
            text-cyan-400
            hover:text-cyan-300
            inline-flex flex-col sm:flex-row sm:items-center sm:gap-2
            focus:outline-none
          "
                >
                    <span className="whitespace-nowrap">
                        ANALISAR ARQUITETURA
                    </span>
                    <span
                        className="
              whitespace-nowrap
              transition-transform duration-150
              group-hover:translate-x-0.5
            "
                    >
                        →
                    </span>
                </button>
            </div>

            {/* Coluna direita: robô e holograma */}
            <div
                className="
          relative
          flex justify-center items-end
          lg:items-center
          mt-10 lg:mt-0
          lg:ml-6
          w-full lg:w-[260px]
        "
            >
                {/* Glow ciano atrás do robô */}
                <div
                    className="
            absolute
            bottom-0 lg:bottom-auto lg:top-1/2
            left-1/2
            -translate-x-1/2
            lg:-translate-y-1/2
            w-[220px] h-[220px]
            rounded-full
            bg-cyan-500/20
            blur-[80px]
            pointer-events-none
          "
                    aria-hidden="true"
                />

                {/* Wrapper da ilustração */}
                <div
                    className="
            relative
            z-10
            flex flex-col items-center
            text-center
          "
                >
                    {/* Robô */}
                    <div
                        className="
              w-[180px] h-[180px]
              sm:w-[200px] sm:h-[200px]
              flex items-center justify-center
              rounded-xl
              bg-[radial-gradient(circle_at_50%_20%,rgba(0,255,255,0.07)_0%,rgba(0,0,0,0)_70%)]
              border border-cyan-600/20
              shadow-[0_30px_100px_rgba(0,255,255,0.18)]
              overflow-hidden
            "
                    >
                        <img
                            src={agentImage}
                            alt="Agente EIAH_Builder"
                            className="
                block
                object-contain
                w-full h-full
              "
                        />
                    </div>

                    
                </div>

                {/* Holograma 'ARCHITECTURE' simulado */}
                <div
                    className="
            hidden lg:block
            absolute
            top-[15%] right-0 translate-x-6
            min-w-[140px]
            rounded-md
            border border-cyan-400/40
            bg-cyan-500/[0.03]
            px-3 py-3
            text-cyan-200
            font-medium
            text-[0.7rem]
            leading-[1rem]
            tracking-wide
            shadow-[0_20px_60px_rgba(0,255,255,0.2)]
          "
                    style={{
                        boxShadow:
                            "0 40px 120px rgba(0,255,255,0.18), 0 0 40px rgba(0,255,255,0.4)"
                    }}
                >
                    <div className="text-cyan-300 text-[0.7rem] font-semibold mb-2">
                        ARCHITECTURE
                    </div>
                    <div
                        className="
              flex items-center gap-2
              text-[0.7rem] leading-[1rem]
              text-cyan-200
            "
                    >
                        <div
                            className="
                flex items-center justify-center
                w-6 h-6 rounded-full
                border border-cyan-400/50
                text-[0.7rem] font-bold
              "
                        >
                            ✓
                        </div>
                        <div className="opacity-80">
                            Multi-tenant OK
                        </div>
                    </div>
                    <div
                        className="
              flex items-center gap-2 mt-1
              text-[0.7rem] leading-[1rem]
              text-cyan-200
            "
                    >
                        <div
                            className="
                flex items-center justify-center
                w-6 h-6 rounded-full
                border border-cyan-400/50
                text-[0.7rem] font-bold
              "
                        >
                            ✓
                        </div>
                        <div className="opacity-80">
                            Observabilidade
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}