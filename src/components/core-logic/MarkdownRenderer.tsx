import React from "react";
import { cn } from "@/lib/utils";

interface MarkdownRendererProps {
  markdown: string;
  className?: string;
}

// Parse inline formatting (bold, italic, code)
function parseInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let keyIndex = 0;

  while (remaining.length > 0) {
    // Check for inline code first
    const codeMatch = remaining.match(/^`([^`]+)`/);
    if (codeMatch) {
      parts.push(
        <code key={keyIndex++} className="px-1.5 py-0.5 rounded bg-muted font-mono text-sm">
          {codeMatch[1]}
        </code>
      );
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    // Check for bold
    const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/);
    if (boldMatch) {
      parts.push(<strong key={keyIndex++} className="font-semibold text-foreground">{boldMatch[1]}</strong>);
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    // Check for italic
    const italicMatch = remaining.match(/^\*([^*]+)\*/);
    if (italicMatch) {
      parts.push(<em key={keyIndex++}>{italicMatch[1]}</em>);
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    // Find next special character
    const nextSpecial = remaining.search(/[`*]/);
    if (nextSpecial === -1) {
      parts.push(remaining);
      break;
    } else if (nextSpecial === 0) {
      // Special character but not matching pattern, just add it
      parts.push(remaining[0]);
      remaining = remaining.slice(1);
    } else {
      parts.push(remaining.slice(0, nextSpecial));
      remaining = remaining.slice(nextSpecial);
    }
  }

  return parts;
}

export function MarkdownRenderer({ markdown, className }: MarkdownRendererProps) {
  const lines = markdown.split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let blockKey = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code fence
    if (line.startsWith("```")) {
      const lang = line.replace("```", "").trim();
      i++;
      const codeLines: string[] = [];
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      blocks.push(
        <div key={blockKey++} className="relative my-4">
          <pre className="p-4 rounded-lg bg-muted/50 border border-border overflow-x-auto">
            <code className="text-sm font-mono text-muted-foreground whitespace-pre">
              {codeLines.join("\n")}
            </code>
          </pre>
          {lang && (
            <span className="absolute top-2 right-2 text-xs text-muted-foreground/60 font-mono">
              {lang}
            </span>
          )}
        </div>
      );
      continue;
    }

    // Horizontal rule
    if (line.trim() === "---") {
      blocks.push(<hr key={blockKey++} className="my-6 border-border" />);
      i++;
      continue;
    }

    // Headings
    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(line);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      
      const headingStyles: Record<number, string> = {
        1: "text-2xl font-bold mt-8 mb-4 text-foreground",
        2: "text-xl font-semibold mt-6 mb-3 text-foreground",
        3: "text-lg font-semibold mt-5 mb-2 text-foreground",
        4: "text-base font-semibold mt-4 mb-2 text-foreground",
        5: "text-sm font-semibold mt-3 mb-1 text-foreground",
        6: "text-sm font-medium mt-2 mb-1 text-muted-foreground",
      };

      const Tag = `h${level}` as keyof JSX.IntrinsicElements;
      blocks.push(
        <Tag key={blockKey++} className={headingStyles[level]}>
          {parseInline(text)}
        </Tag>
      );
      i++;
      continue;
    }

    // Lists (unordered)
    if (/^\s*-\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*-\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*-\s+/, ""));
        i++;
      }
      blocks.push(
        <ul key={blockKey++} className="my-3 ml-4 space-y-1.5 list-disc list-outside">
          {items.map((item, idx) => (
            <li key={idx} className="text-muted-foreground pl-1">
              {parseInline(item)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragraph
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].startsWith("```") &&
      lines[i].trim() !== "---" &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !/^\s*-\s+/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    
    if (paraLines.length > 0) {
      blocks.push(
        <p key={blockKey++} className="my-3 text-muted-foreground leading-relaxed">
          {parseInline(paraLines.join(" "))}
        </p>
      );
    }
  }

  return (
    <div className={cn("prose prose-invert max-w-none", className)}>
      {blocks}
    </div>
  );
}
