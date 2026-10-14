"use client";

import { FileCheck2, FileUp, LoaderCircle, RotateCcw } from "lucide-react";
import { ChangeEvent, DragEvent, useRef, useState } from "react";
import { ParsedPdfData, parsePdfLocally } from "../lib/pdf-import";

const MAX_FILE_SIZE = 20 * 1024 * 1024;

export function PdfDropzone({ onParsed }: { onParsed: (data: ParsedPdfData, previous: ParsedPdfData | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previousResultRef = useRef<ParsedPdfData | null>(null);
  const [dragging, setDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState(0);
  const [result, setResult] = useState<ParsedPdfData | null>(null);
  const [error, setError] = useState("");

  const parseFile = async (file: File | undefined) => {
    if (!file || parsing) return;
    setError("");
    setResult(null);
    if (file.type !== "application/pdf" && !file.name.toLocaleLowerCase().endsWith(".pdf")) {
      setError("请选择 PDF 文件");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError("PDF 不能超过 20 MB");
      return;
    }

    setFileName(file.name);
    setFileSize(file.size);
    setParsing(true);
    try {
      const parsed = await parsePdfLocally(file);
      setResult(parsed);
      onParsed(parsed, previousResultRef.current);
      previousResultRef.current = parsed;
    } catch {
      setError("无法读取该 PDF。文件可能已加密或损坏，你仍可手动录入。");
    } finally {
      setParsing(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const onInput = (event: ChangeEvent<HTMLInputElement>) => void parseFile(event.target.files?.[0]);
  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    void parseFile(event.dataTransfer.files?.[0]);
  };

  const detectedFields = result
    ? [result.title && "标题", result.authors && "作者", result.year && "年份", result.journal && "来源", result.doi && "DOI", result.url && "链接", result.abstract && "摘要"].filter(Boolean)
    : [];

  return (
    <div className="pdf-import full-field">
      <label
        className={`pdf-dropzone ${dragging ? "dragging" : ""} ${result ? "parsed" : ""}`}
        onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          const relatedTarget = event.relatedTarget;
          if (!(relatedTarget instanceof Node) || !event.currentTarget.contains(relatedTarget)) setDragging(false);
        }}
        onDrop={onDrop}
      >
        <input ref={inputRef} type="file" accept="application/pdf,.pdf" onChange={onInput} disabled={parsing} />
        <span className="pdf-drop-icon" aria-hidden="true">
          {parsing ? <LoaderCircle className="spin" size={25} /> : result ? <FileCheck2 size={25} /> : <FileUp size={25} />}
        </span>
        <span className="pdf-drop-copy">
          <strong>{parsing ? "正在解析 PDF…" : result ? "PDF 解析完成" : "拖入 PDF，辅助填写文献信息"}</strong>
          <small>{fileName ? `${fileName} · ${formatFileSize(fileSize)}` : "也可以点击选择文件，最大 20 MB"}</small>
        </span>
        {fileName && !parsing && <span className="pdf-reselect"><RotateCcw size={14} />重新选择</span>}
      </label>
      <p className="pdf-privacy">文件只在当前浏览器中解析，不会上传或保存 PDF 原文件。</p>
      {result && <p className={result.hasExtractableText ? "pdf-result" : "pdf-warning"}>共 {result.pageCount} 页{detectedFields.length ? `，已识别并填入：${detectedFields.join("、")}` : "，未识别到可填入的信息，请手动完善"}。重新选择 PDF 会更新自动识别结果，手工修改过的内容会保留。{!result.hasExtractableText && "未提取到正文文字，可能是扫描版 PDF，摘要需要手动填写。"}</p>}
      {error && <p className="pdf-error" role="alert">{error}</p>}
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
