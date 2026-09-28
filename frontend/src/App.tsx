import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUp,
  CheckCircle2,
  Clipboard,
  FileText,
  Loader2,
  PanelRight,
  Plus,
  Search,
  UploadCloud,
  X,
} from "lucide-react";
import { DragEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { MarkdownMessage } from "@/components/markdown-message";
import {
  API_BASE_URL,
  getReadiness,
  ingestFile,
  ingestText,
  searchRag,
  streamAgent,
  type RagSource,
} from "@/lib/api";
import { cn } from "@/lib/utils";

type Message = {
  id: string;
  role: "user" | "agent";
  content: string;
  sources?: RagSource[];
};

type KnowledgeDocument = {
  source: string;
  chunks?: number;
  content?: string;
  contentType?: string;
  documentType: "knowledge" | "voice_sample";
  status: "processing" | "indexed" | "failed";
  updatedAt: Date;
  retrieved?: boolean;
  error?: string;
};

const supportedFileTypes = ".txt,.md,.markdown,.json,.pdf";

const examples = [
  "Summarize the likely cause of this customer issue.",
  "Draft a calm reply for an escalated support ticket.",
  "Turn this incident into a support-team action plan.",
  "Rewrite this in my voice: Your request has been processed successfully.",
];

function createId() {
  return crypto.randomUUID();
}

function BrandMark({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" className={className} aria-hidden="true">
      <path
        d="M14 2.5 24 8.25v11.5L14 25.5 4 19.75V8.25L14 2.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="m9.4 10.6 4.6-2.65 4.6 2.65v5.3L14 18.55 9.4 15.9v-5.3Z"
        fill="currentColor"
        fillOpacity=".12"
        stroke="currentColor"
        strokeWidth="1.1"
      />
      <circle cx="14" cy="21.6" r=".9" fill="currentColor" />
    </svg>
  );
}

function SyntheticLoader() {
  return (
    <div className="synthetic-loader" role="status" aria-label="Generating response">
      <span />
      <span />
      <span />
    </div>
  );
}

function formatUpdatedTime(date: Date) {
  const elapsed = Math.max(0, Date.now() - date.getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `Updated ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Updated ${hours}h ago`;
  return `Updated ${Math.floor(hours / 24)}d ago`;
}

function StatusIndicator({ status }: { status: KnowledgeDocument["status"] }) {
  const label = status === "indexed" ? "Indexed" : status === "processing" ? "Processing" : "Failed";
  return (
    <span className={cn("knowledge-status", `knowledge-status--${status}`)} role="status" aria-live="polite">
      <span className="knowledge-status__dot" aria-hidden="true" />
      {label}
    </span>
  );
}

type KnowledgeWorkspaceProps = {
  documents: KnowledgeDocument[];
  documentType: "knowledge" | "voice_sample";
  filePending: boolean;
  searchPending: boolean;
  searchHasRun: boolean;
  searchQuery: string;
  source: string;
  text: string;
  textPending: boolean;
  onDocumentTypeChange: (type: "knowledge" | "voice_sample") => void;
  onFile: (file: File) => void;
  onSearch: () => void;
  onSearchQueryChange: (value: string) => void;
  onSourceChange: (value: string) => void;
  onTextChange: (value: string) => void;
  onTextSubmit: () => void;
};

function KnowledgeWorkspace({
  documents,
  documentType,
  filePending,
  searchPending,
  searchHasRun,
  searchQuery,
  source,
  text,
  textPending,
  onDocumentTypeChange,
  onFile,
  onSearch,
  onSearchQueryChange,
  onSourceChange,
  onTextChange,
  onTextSubmit,
}: KnowledgeWorkspaceProps) {
  const [showAddSource, setShowAddSource] = useState(false);
  const [addMode, setAddMode] = useState<"file" | "text">("file");
  const [dragActive, setDragActive] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const sourcePanel = useRef<HTMLDivElement>(null);
  const closeSourcePanel = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!showAddSource) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeSourcePanel.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setShowAddSource(false);
        return;
      }

      if (event.key !== "Tab" || !sourcePanel.current) return;
      const focusable = Array.from(
        sourcePanel.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.tabIndex >= 0);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [showAddSource]);

  function acceptFile(file: File) {
    const extension = file.name.includes(".") ? `.${file.name.split(".").pop()?.toLowerCase()}` : "";
    if (![".txt", ".md", ".markdown", ".json", ".pdf"].includes(extension)) {
      toast.error("Unsupported file type", {
        description: "Choose a TXT, MD, MARKDOWN, JSON, or PDF file.",
      });
      return;
    }
    onFile(file);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (file) acceptFile(file);
  }

  return (
    <section className="knowledge-workspace page-enter">
      <div className="knowledge-workspace__inner">
        <div className="knowledge-heading">
          <div>
            <p className="knowledge-eyebrow">Workspace</p>
            <h1>Knowledge</h1>
            <p>Your connected knowledge</p>
          </div>
          <Button type="button" size="sm" onClick={() => setShowAddSource(true)}>
            <Plus className="size-3.5" aria-hidden="true" />
            Add source
          </Button>
        </div>

        <form
          className="knowledge-search"
          onSubmit={(event) => {
            event.preventDefault();
            onSearch();
          }}
        >
          <Search className="size-4" aria-hidden="true" />
          <input
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            placeholder="Search knowledge..."
            aria-label="Search knowledge"
          />
          {searchPending ? <Loader2 className="size-3.5 animate-spin text-zinc-500" aria-hidden="true" /> : null}
          {searchQuery ? (
            <button type="button" onClick={() => onSearchQueryChange("")} aria-label="Clear search">
              <X className="size-3.5" aria-hidden="true" />
            </button>
          ) : null}
        </form>

        {documents.length ? (
          <div className="knowledge-list" aria-label="Knowledge documents" aria-live="polite">
            {documents.map((document) => (
              <article key={`${document.documentType}-${document.source}`} className="knowledge-row">
                <div className="knowledge-row__icon" aria-hidden="true">
                  <FileText className="size-4" />
                </div>
                <div className="knowledge-row__main">
                  <h2>{document.source}</h2>
                  <p>
                    {typeof document.chunks === "number"
                      ? `${document.chunks} ${document.chunks === 1 ? "chunk" : "chunks"}`
                      : document.contentType || "Knowledge source"}
                    <span aria-hidden="true"> · </span>
                    {document.retrieved ? "Found in search" : formatUpdatedTime(document.updatedAt)}
                  </p>
                  {document.error ? <p className="knowledge-row__error">{document.error}</p> : null}
                </div>
                <div className="knowledge-row__meta">
                  {document.documentType === "voice_sample" ? <span className="knowledge-kind">Voice</span> : null}
                  <StatusIndicator status={document.status} />
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="knowledge-empty">
            <div className="knowledge-empty__mark" aria-hidden="true">◇</div>
            <h2>{searchHasRun ? "No matching knowledge" : "Build your knowledge"}</h2>
            <p>
              {searchHasRun
                ? "Try a different search, or connect a new source."
                : "Connect your first source to give ResolveAI knowledge to work with."}
            </p>
            <Button type="button" size="sm" variant="secondary" onClick={() => setShowAddSource(true)}>
              <Plus className="size-3.5" aria-hidden="true" />
              Add source
            </Button>
          </div>
        )}

        {showAddSource ? (
          <div
            ref={sourcePanel}
            className="source-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-source-title"
            aria-describedby="add-source-description"
          >
            <button
              type="button"
              className="source-panel__backdrop"
              onClick={() => setShowAddSource(false)}
              aria-label="Close add source panel"
              tabIndex={-1}
            />
            <div className="source-panel__content">
              <div className="source-panel__header">
                <div>
                  <p className="knowledge-eyebrow">Knowledge</p>
                  <h2 id="add-source-title">Add source</h2>
                  <p id="add-source-description" className="sr-only">
                    Upload a supported file or paste text to add it to ResolveAI knowledge.
                  </p>
                </div>
                <button
                  ref={closeSourcePanel}
                  type="button"
                  onClick={() => setShowAddSource(false)}
                  aria-label="Close add source panel"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </div>

              <div className="source-type" role="group" aria-label="Source type">
                <button
                  type="button"
                  aria-pressed={documentType === "knowledge"}
                  onClick={() => onDocumentTypeChange("knowledge")}
                >
                  Knowledge
                </button>
                <button
                  type="button"
                  aria-pressed={documentType === "voice_sample"}
                  onClick={() => onDocumentTypeChange("voice_sample")}
                >
                  Voice sample
                </button>
              </div>

              <div className="source-mode" role="group" aria-label="Add source method">
                <button type="button" aria-pressed={addMode === "file"} onClick={() => setAddMode("file")}>
                  Upload file
                </button>
                <button type="button" aria-pressed={addMode === "text"} onClick={() => setAddMode("text")}>
                  Paste text
                </button>
              </div>

              {addMode === "file" ? (
                <div
                  className={cn("upload-dropzone", dragActive && "upload-dropzone--active")}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setDragActive(true);
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDragLeave={(event) => {
                    if (event.currentTarget === event.target) setDragActive(false);
                  }}
                  onDrop={handleDrop}
                >
                  {filePending ? <Loader2 className="size-5 animate-spin text-indigo-300" aria-hidden="true" /> : <UploadCloud className="size-5 text-zinc-500" aria-hidden="true" />}
                  <h3>{filePending ? "Processing file" : "Drop files here"}</h3>
                  <p>PDF · TXT · MD · MARKDOWN · JSON</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={filePending}
                    onClick={() => fileInput.current?.click()}
                  >
                    Browse files
                  </Button>
                  <input
                    ref={fileInput}
                    type="file"
                    className="sr-only"
                    accept={supportedFileTypes}
                    aria-label="Choose a knowledge source file"
                    tabIndex={-1}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) acceptFile(file);
                      event.currentTarget.value = "";
                    }}
                  />
                </div>
              ) : (
                <div className="source-text-form">
                  <label>
                    Source name
                    <input
                      value={source}
                      onChange={(event) => onSourceChange(event.target.value)}
                      className="control"
                      placeholder="e.g. Refund policy"
                    />
                  </label>
                  <label>
                    Content
                    <textarea
                      value={text}
                      onChange={(event) => onTextChange(event.target.value)}
                      className="control"
                      rows={9}
                      placeholder={documentType === "voice_sample" ? "Paste something you wrote..." : "Paste knowledge content..."}
                    />
                  </label>
                  <div className="source-text-form__actions">
                    <Button
                      type="button"
                      size="sm"
                      disabled={!text.trim() || !source.trim() || textPending}
                      onClick={onTextSubmit}
                    >
                      {textPending ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Plus className="size-3.5" aria-hidden="true" />}
                      Add source
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export default function App() {
  const queryClient = useQueryClient();
  const [activePage, setActivePage] = useState<"chat" | "knowledge">(() =>
    window.location.hash === "#knowledge" ? "knowledge" : "chat",
  );
  const [threadId, setThreadId] = useState("demo-thread");
  const [streaming, setStreaming] = useState(false);
  const [draft, setDraft] = useState("");
  const [knowledgeSource, setKnowledgeSource] = useState("");
  const [knowledgeText, setKnowledgeText] = useState("");
  const [documentType, setDocumentType] = useState<"knowledge" | "voice_sample">("knowledge");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<RagSource[]>([]);
  const [searchHasRun, setSearchHasRun] = useState(false);
  const [knowledgeDocuments, setKnowledgeDocuments] = useState<KnowledgeDocument[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    function syncPageToHash() {
      setActivePage(window.location.hash === "#knowledge" ? "knowledge" : "chat");
    }

    window.addEventListener("hashchange", syncPageToHash);
    return () => window.removeEventListener("hashchange", syncPageToHash);
  }, []);

  function updateKnowledgeDocument(source: string, updates: Partial<KnowledgeDocument>) {
    setKnowledgeDocuments((current) => {
      const existing = current.find((document) => document.source === source);
      const next: KnowledgeDocument = {
        source,
        documentType: existing?.documentType ?? documentType,
        status: existing?.status ?? "processing",
        updatedAt: new Date(),
        ...existing,
        ...updates,
      };
      return [next, ...current.filter((document) => document.source !== source)];
    });
  }

  const readiness = useQuery({
    queryKey: ["readiness"],
    queryFn: getReadiness,
    refetchInterval: 10_000,
    retry: false,
  });

  const runStream = async (input: { message: string; thread_id?: string }) => {
    const responseId = createId();
    setStreaming(true);
    setMessages((current) => [...current, { id: responseId, role: "agent", content: "" }]);
    try {
      for await (const event of streamAgent(input)) {
        if (event.type === "delta") {
          setMessages((current) =>
            current.map((message) =>
              message.id === responseId
                ? { ...message, content: message.content + event.text }
                : message,
            ),
          );
        } else if (event.type === "sources") {
          setMessages((current) =>
            current.map((message) =>
              message.id === responseId ? { ...message, sources: event.sources } : message,
            ),
          );
        }
      }
    } catch (error) {
      toast.error("Agent request failed", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
      setMessages((current) => current.filter((message) => message.id !== responseId));
    } finally {
      setStreaming(false);
    }
  };

  const textIngestion = useMutation({
    mutationFn: ingestText,
    onMutate: (input) => {
      updateKnowledgeDocument(input.source, {
        documentType: input.documentType ?? "knowledge",
        status: "processing",
        retrieved: false,
        error: undefined,
      });
    },
    onSuccess: (response, input) => {
      setKnowledgeText("");
      updateKnowledgeDocument(response.source, {
        chunks: response.chunks,
        documentType: input.documentType ?? "knowledge",
        status: "indexed",
        error: undefined,
      });
      toast.success(
        input.documentType === "voice_sample" ? "Voice sample ingested" : "Knowledge ingested",
        {
          description: `${response.source}: ${response.chunks} chunks`,
        },
      );
      void queryClient.invalidateQueries({ queryKey: ["rag-search"] });
    },
    onError: (error, input) => {
      updateKnowledgeDocument(input.source, {
        documentType: input.documentType ?? "knowledge",
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      });
      toast.error("RAG ingestion failed", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    },
  });

  const fileIngestion = useMutation({
    mutationFn: ({ file, type }: { file: File; type: "knowledge" | "voice_sample" }) =>
      ingestFile(file, type),
    onMutate: ({ file, type }) => {
      updateKnowledgeDocument(file.name, {
        contentType: file.type || undefined,
        documentType: type,
        status: "processing",
        retrieved: false,
        error: undefined,
      });
    },
    onSuccess: (response, { file, type }) => {
      updateKnowledgeDocument(response.source, {
        chunks: response.chunks,
        contentType: file.type || undefined,
        documentType: type,
        status: "indexed",
        error: undefined,
      });
      toast.success("File ingested", {
        description: `${response.source}: ${response.chunks} chunks`,
      });
      void queryClient.invalidateQueries({ queryKey: ["rag-search"] });
    },
    onError: (error, { file, type }) => {
      updateKnowledgeDocument(file.name, {
        contentType: file.type || undefined,
        documentType: type,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      });
      toast.error("File ingestion failed", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    },
  });

  const ragSearch = useMutation({
    mutationKey: ["rag-search"],
    mutationFn: searchRag,
    onSuccess: (response) => {
      setSearchResults(response.sources);
      setSearchHasRun(true);
    },
    onError: (error) => {
      setSearchHasRun(true);
      toast.error("RAG search failed", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    },
  });

  const displayedKnowledgeDocuments = useMemo(() => {
    if (searchHasRun) {
      const grouped = new Map<string, KnowledgeDocument>();
      for (const result of searchResults) {
        const existing = grouped.get(result.source);
        grouped.set(result.source, {
          source: result.source,
          chunks: (existing?.chunks ?? 0) + 1,
          content: existing?.content ?? result.content,
          contentType:
            existing?.contentType ??
            (typeof result.metadata.content_type === "string" ? result.metadata.content_type : undefined),
          documentType: "knowledge",
          status: "indexed",
          updatedAt: new Date(),
          retrieved: true,
        });
      }
      return Array.from(grouped.values());
    }
    return knowledgeDocuments;
  }, [knowledgeDocuments, searchHasRun, searchResults]);

  const status = useMemo(() => {
    if (readiness.isLoading) return "Checking";
    if (readiness.data) return "Ready";
    return "Offline";
  }, [readiness.data, readiness.isLoading]);

  function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || streaming) return;

    setMessages((current) => [...current, { id: createId(), role: "user", content: message }]);
    setDraft("");
    void runStream({ message, thread_id: threadId || undefined });
  }

  async function copyTranscript() {
    const transcript = messages
      .map((message) => `${message.role === "user" ? "User" : "ResolveAI"}: ${message.content}`)
      .join("\n\n");
    await navigator.clipboard.writeText(transcript);
    toast.success("Transcript copied");
  }

  const hasConversation = messages.length > 0;
  const connectionLabel = readiness.isLoading
    ? "Checking knowledge connection"
    : readiness.data
      ? "Knowledge connection ready"
      : "Knowledge connection unavailable";

  function renderComposer(emptyState = false) {
    return (
      <form
        onSubmit={submitMessage}
        className={cn("w-full", emptyState ? "mx-auto max-w-2xl" : "mx-auto max-w-3xl")}
      >
        <div
          className={cn(
            "group relative rounded-xl border bg-[#0d0d0f] transition-[border-color,box-shadow,background-color] duration-200",
            "border-white/10 shadow-[0_12px_36px_rgba(0,0,0,0.16)] focus-within:border-indigo-300/40 focus-within:bg-[#101012] focus-within:shadow-[0_0_0_3px_rgba(165,180,252,0.07)]",
            emptyState && "shadow-[0_0_36px_rgba(165,180,252,0.025),0_12px_36px_rgba(0,0,0,0.16)]",
          )}
        >
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            rows={2}
            maxLength={16_000}
            className="max-h-44 min-h-[72px] w-full resize-none bg-transparent px-4 py-3.5 pr-14 text-sm leading-6 text-zinc-100 outline-none placeholder:text-zinc-500 sm:px-5 sm:py-4"
            placeholder="Ask ResolveAI..."
            aria-label="Message ResolveAI"
          />
          <Button
            type="submit"
            size="icon"
            disabled={streaming || !draft.trim()}
            className="absolute bottom-2.5 right-2.5 size-9 rounded-lg"
            aria-label={streaming ? "Response is streaming" : "Send message"}
          >
            {streaming ? <SyntheticLoader /> : <ArrowUp className="size-4" aria-hidden="true" />}
          </Button>
        </div>
        <div className="mt-2.5 flex min-h-8 items-center justify-between gap-3 px-1">
          <label className="flex min-w-0 items-center gap-2 text-[11px] text-zinc-500">
            <span className="shrink-0">Thread</span>
            <input
              value={threadId}
              onChange={(event) => setThreadId(event.target.value)}
              className="min-w-0 max-w-44 border-0 bg-transparent p-0 font-mono text-[11px] text-zinc-400 outline-none transition-colors placeholder:text-zinc-600 focus:text-zinc-200"
              placeholder="thread id"
            />
          </label>
          <span className="hidden text-[10px] text-zinc-500 sm:inline">Enter to send · Shift + Enter for newline</span>
        </div>
      </form>
    );
  }

  return (
    <main className="app-shell min-h-dvh bg-[#080808] text-zinc-100">
      <header className="app-header sticky top-0 z-40 border-b border-white/[0.07] bg-[#080808]/92 px-3 py-3 backdrop-blur-xl sm:px-5">
        <div className="app-header__inner mx-auto flex min-h-11 max-w-[1500px] items-center gap-3">
          <a
            href="#chat"
            onClick={() => setActivePage("chat")}
            className="brand-link flex shrink-0 items-center gap-2.5 rounded-lg text-indigo-300 outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-indigo-300/50"
            aria-label="ResolveAI home"
          >
            <BrandMark />
            <span className="text-sm font-semibold tracking-[-0.02em] text-zinc-100">ResolveAI</span>
          </a>

          <nav className="primary-nav ml-1 flex min-w-0 flex-1 items-center overflow-x-auto sm:ml-5" aria-label="Primary navigation">
            <a
              href="#chat"
              className="nav-link"
              aria-current={activePage === "chat" ? "page" : undefined}
              onClick={() => setActivePage("chat")}
            >
              Chat
            </a>
            <a
              href="#knowledge"
              className="nav-link"
              aria-current={activePage === "knowledge" ? "page" : undefined}
              onClick={() => setActivePage("knowledge")}
            >
              Knowledge
            </a>
            <a href="#runtime" className="nav-link" onClick={() => setActivePage("chat")}>
              Runtime
            </a>
          </nav>

          <div className="header-actions flex shrink-0 items-center gap-2">
            <span
              className={cn(
                "inline-flex h-8 items-center gap-2 rounded-lg border px-2.5 text-[11px] font-medium",
                readiness.data
                  ? "border-indigo-300/15 bg-indigo-300/[0.06] text-indigo-200"
                  : "border-white/10 bg-white/[0.03] text-zinc-500",
              )}
              title={`API status: ${status}`}
              role="status"
              aria-live="polite"
            >
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  readiness.data ? "bg-indigo-300 shadow-[0_0_8px_rgba(165,180,252,0.8)]" : "bg-zinc-600",
                )}
              />
              <span className="hidden sm:inline">{status}</span>
            </span>
            {activePage === "chat" ? (
              <Button type="button" variant="ghost" size="sm" onClick={copyTranscript} disabled={!hasConversation} aria-label="Copy transcript">
                <Clipboard className="size-3.5" aria-hidden="true" />
                <span className="hidden md:inline">Copy</span>
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      {activePage === "knowledge" ? (
        <KnowledgeWorkspace
          documents={displayedKnowledgeDocuments}
          documentType={documentType}
          filePending={fileIngestion.isPending}
          searchPending={ragSearch.isPending}
          searchHasRun={searchHasRun}
          searchQuery={searchQuery}
          source={knowledgeSource}
          text={knowledgeText}
          textPending={textIngestion.isPending}
          onDocumentTypeChange={setDocumentType}
          onFile={(file) => fileIngestion.mutate({ file, type: documentType })}
          onSearch={() => {
            if (searchQuery.trim()) ragSearch.mutate(searchQuery.trim());
          }}
          onSearchQueryChange={(value) => {
            setSearchQuery(value);
            if (!value) {
              setSearchHasRun(false);
              setSearchResults([]);
            }
          }}
          onSourceChange={setKnowledgeSource}
          onTextChange={setKnowledgeText}
          onTextSubmit={() =>
            textIngestion.mutate({
              source: knowledgeSource.trim(),
              text: knowledgeText.trim(),
              documentType,
            })
          }
        />
      ) : (
      <div className="page-enter mx-auto grid max-w-[1500px] xl:grid-cols-[minmax(0,1fr)_348px]">
        <section id="chat" className="chat-workspace flex min-w-0 scroll-mt-28 flex-col xl:scroll-mt-20">
          {hasConversation ? (
            <>
              <div className="shrink-0 border-b border-white/[0.055] px-4 py-3 sm:px-7">
                <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="size-1.5 shrink-0 rounded-full bg-indigo-300 shadow-[0_0_8px_rgba(165,180,252,0.55)]" />
                    <p className="truncate text-xs font-medium text-zinc-400">Conversation</p>
                    <span className="text-zinc-800" aria-hidden="true">
                      /
                    </span>
                    <p className="truncate font-mono text-[10px] text-zinc-600">{threadId || "no thread"}</p>
                  </div>
                  <span className="text-[10px] text-zinc-500">Knowledge enabled</span>
                </div>
              </div>

              <div className="min-h-0 flex-1 scroll-pb-48 overflow-y-auto px-4 py-8 sm:px-7 sm:py-12">
                <div className="mx-auto flex max-w-3xl flex-col gap-10 sm:gap-12" role="log" aria-live="polite" aria-relevant="additions text">
                  {messages.map((message) => (
                    <article key={message.id} className="grid grid-cols-[24px_minmax(0,1fr)] gap-3 sm:grid-cols-[32px_minmax(0,1fr)] sm:gap-4">
                      <div
                        className={cn(
                          "mt-0.5 flex size-6 items-center justify-center text-[10px] font-semibold sm:size-8",
                          message.role === "agent"
                            ? "text-indigo-300"
                            : "rounded-full border border-white/[0.08] bg-white/[0.025] text-zinc-600",
                        )}
                        aria-hidden="true"
                      >
                        {message.role === "agent" ? <BrandMark className="size-6 sm:size-7" /> : "Y"}
                      </div>

                      <div className="min-w-0">
                        <p
                          className={cn(
                            "mb-2 text-[11px] font-medium",
                            message.role === "agent" ? "text-zinc-300" : "text-zinc-500",
                          )}
                        >
                          {message.role === "agent" ? "ResolveAI" : "You"}
                        </p>

                        {message.role === "agent" ? (
                          message.content ? (
                            <div className="markdown-message text-[15px] leading-7 text-zinc-300">
                              <MarkdownMessage content={message.content} />
                            </div>
                          ) : streaming ? (
                            <div className="flex h-8 items-center">
                              <SyntheticLoader />
                            </div>
                          ) : null
                        ) : (
                          <p className="max-w-2xl whitespace-pre-wrap break-words text-sm leading-6 text-zinc-400">
                            {message.content}
                          </p>
                        )}

                        {message.sources?.length ? (
                          <div className="mt-7 border-t border-white/[0.07] pt-4">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Sources</p>
                            <ol className="mt-2.5 space-y-1.5">
                              {message.sources.map((source, index) => (
                                <li
                                  key={`${source.source}-${index}`}
                                  className="flex min-w-0 items-center gap-2.5 text-xs text-zinc-500"
                                >
                                  <span className="flex size-4 shrink-0 items-center justify-center rounded border border-white/[0.08] font-mono text-[9px] text-zinc-500">
                                    {index + 1}
                                  </span>
                                  <span className="truncate text-zinc-400">{source.source}</span>
                                  {typeof source.score === "number" ? (
                                    <span className="ml-auto shrink-0 font-mono text-[10px] text-zinc-500">
                                      {source.score.toFixed(3)}
                                    </span>
                                  ) : null}
                                </li>
                              ))}
                            </ol>
                          </div>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              </div>

              <div className="sticky bottom-0 z-20 shrink-0 border-t border-white/[0.06] bg-[#080808]/92 px-4 py-4 backdrop-blur-xl sm:px-7 sm:py-5">
                {renderComposer()}
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center px-4 py-12 sm:px-7">
              <div className="mb-[8vh] flex w-full max-w-2xl flex-col items-center text-center">
                <div className="text-indigo-300 drop-shadow-[0_0_18px_rgba(165,180,252,0.16)]">
                  <BrandMark className="size-12" />
                </div>
                <h1 className="mt-6 text-xl font-semibold tracking-[-0.025em] text-zinc-100">ResolveAI</h1>
                <p className="mt-2 text-sm text-zinc-500">Ask anything about your knowledge.</p>
                <div className="mt-8 w-full">{renderComposer(true)}</div>
                <div className="mt-4 flex items-center gap-2 text-[11px] text-zinc-500">
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      readiness.data
                        ? "bg-indigo-300 shadow-[0_0_7px_rgba(165,180,252,0.65)]"
                        : "bg-zinc-700",
                    )}
                  />
                  {connectionLabel}
                </div>
              </div>
            </div>
          )}
        </section>

        <aside className="chat-sidebar min-h-0 border-t border-white/[0.07] bg-[#0a0a0b] px-5 py-6 xl:overflow-y-auto xl:border-l xl:border-t-0">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">
            <PanelRight className="size-4" aria-hidden="true" />
            Test Bench
          </div>

          <div className="mt-4 divide-y divide-white/[0.06] border-y border-white/[0.06]">
            {examples.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setDraft(example)}
                className="group w-full px-1 py-3 text-left text-xs leading-5 text-zinc-500 transition-colors hover:text-zinc-200 focus-visible:outline-none focus-visible:text-indigo-200"
              >
                <span className="flex gap-2.5"><span className="mt-2 size-1 shrink-0 rounded-full bg-zinc-700 transition-colors group-hover:bg-indigo-300" />{example}</span>
              </button>
            ))}
          </div>

          <div id="runtime" className="mt-8 scroll-mt-24 border-t border-white/[0.08] pt-6">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">
              <CheckCircle2 className="size-4 text-indigo-300" aria-hidden="true" />
              Runtime
            </div>
            <dl className="mt-4 space-y-3 font-mono text-xs">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-zinc-500">API</dt>
                <dd className="truncate text-zinc-400">{API_BASE_URL}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-zinc-500">UI</dt>
                <dd className="text-zinc-400">5173</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-zinc-500">Thread</dt>
                <dd className="max-w-36 truncate text-zinc-400">{threadId || "none"}</dd>
              </div>
            </dl>
          </div>
        </aside>
      </div>
      )}
    </main>
  );
}
