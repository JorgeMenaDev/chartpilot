import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Assistant text as Markdown, styled to sit in a chat column. */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="space-y-3 leading-relaxed [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-3 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em] [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-medium [&_li]:my-1 [&_ol]:list-decimal [&_ol]:ps-5 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_strong]:font-semibold [&_table]:w-full [&_table]:text-left [&_td]:border-b [&_td]:border-border [&_td]:py-1.5 [&_th]:border-b [&_th]:border-border [&_th]:py-1.5 [&_th]:font-medium [&_ul]:list-disc [&_ul]:ps-5">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
