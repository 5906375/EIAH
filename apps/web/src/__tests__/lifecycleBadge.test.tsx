import React from "react";
import { render } from "@testing-library/react";
import LifecycleBadge from "@/components/marketplace/LifecycleBadge";

describe("LifecycleBadge", () => {
  it("renders DRAFT/ACTIVE/DISABLED badges", () => {
    const { container } = render(
      <div>
        <LifecycleBadge status="DRAFT" />
        <LifecycleBadge status="ACTIVE" />
        <LifecycleBadge status="DISABLED" />
      </div>
    );
    expect(container.firstChild).toMatchInlineSnapshot(`
      <div>
        <span
          class="inline-flex w-fit items-center rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.25em] border-slate-400/40 bg-slate-400/10 text-slate-200"
        >
          DRAFT
        </span>
        <span
          class="inline-flex w-fit items-center rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.25em] border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
        >
          ACTIVE
        </span>
        <span
          class="inline-flex w-fit items-center rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.25em] border-rose-400/40 bg-rose-400/10 text-rose-200"
        >
          DISABLED
        </span>
      </div>
    `);
  });
});
