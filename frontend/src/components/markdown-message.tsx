import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

type MarkdownMessageProps = {
  content: string;
};

export function MarkdownMessage({ content }: MarkdownMessageProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ className, ...props }) => (
          <a
            className={cn("font-medium text-indigo-300 underline decoration-indigo-300/40 underline-offset-2 hover:text-indigo-200", className)}
            target="_blank"
            rel="noreferrer"
            {...props}
          />
        ),
        code: ({ className, children, ...props }) => (
          <code
            className={cn(
              "rounded border border-white/10 bg-white/[0.06] px-1.5 py-0.5 font-mono text-[0.9em] text-zinc-200",
              className,
            )}
            {...props}
          >
            {children}
          </code>
        ),
        pre: ({ className, ...props }) => (
          <pre
            className={cn(
              "my-3 overflow-x-auto rounded-lg border border-white/10 bg-black/40 p-3 text-sm text-zinc-100",
              className,
            )}
            {...props}
          />
        ),
        table: ({ className, ...props }) => (
          <div className="my-3 overflow-x-auto">
            <table className={cn("w-full border-collapse text-left text-sm", className)} {...props} />
          </div>
        ),
        th: ({ className, ...props }) => (
          <th
            className={cn("border border-white/10 bg-white/[0.04] px-2 py-1 font-semibold", className)}
            {...props}
          />
        ),
        td: ({ className, ...props }) => (
          <td className={cn("border border-white/10 px-2 py-1 align-top", className)} {...props} />
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
