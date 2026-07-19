import { useCallback, useMemo, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import type { DataRecord, DashboardConfig, WidgetConfig } from '@dashboard-generator/core';
import {
  parseCSV, parseExcel, readFileAsArrayBuffer, readFileAsText, analyzeData,
  suggestCharts, suggestKPIs, suggestFilters, suggestCalculatedFields,
  generateDashboardBlueprint, processNL, explainChart,
  type DataAnalysis, type ChartSuggestion, type KPISuggestion, type FilterSuggestion, type CalcFieldSuggestion, type NLResult,
} from './ai-engine';

/* ================================================================== */
/*  Types                                                               */
/* ================================================================== */

export interface AIPanelProps {
  onApplyDashboard?: (config: DashboardConfig) => void;
}

type AITab = 'upload' | 'analyze' | 'suggest' | 'nl';

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
}

/* ================================================================== */
/*  AIPanel                                                             */
/* ================================================================== */

export function AIPanel({ onApplyDashboard }: AIPanelProps) {
  const [activeTab, setActiveTab] = useState<AITab>('upload');
  const [rawData, setRawData] = useState<DataRecord[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [fileType, setFileType] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [analysis, setAnalysis] = useState<DataAnalysis | null>(null);
  const [selectedCharts, setSelectedCharts] = useState<Set<string>>(new Set());
  const [selectedKpis, setSelectedKpis] = useState<Set<string>>(new Set());
  const [selectedFilters, setSelectedFilters] = useState<Set<string>>(new Set());
  const [selectedCalcs, setSelectedCalcs] = useState<Set<string>>(new Set());
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { role: 'assistant', text: 'Hello! I can help you create dashboards from your data. Upload a CSV or Excel file to get started, or type "help" for available commands.', timestamp: Date.now() },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [explanation, setExplanation] = useState<string | null>(null);
  const [showApplyConfirm, setShowApplyConfirm] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const handleFile = useCallback(async (file: File) => {
    setLoading(true);
    setError('');
    setRawData(null);
    setAnalysis(null);
    setSelectedCharts(new Set());
    setSelectedKpis(new Set());
    setSelectedFilters(new Set());
    setSelectedCalcs(new Set());

    try {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      let data: DataRecord[] = [];

      if (ext === 'csv' || ext === 'tsv' || ext === 'txt') {
        setFileType('CSV');
        const text = await readFileAsText(file);
        data = parseCSV(text);
      } else if (ext === 'xlsx' || ext === 'xls') {
        setFileType('Excel');
        const buffer = await readFileAsArrayBuffer(file);
        data = parseExcel(buffer);
      } else {
        throw new Error(`Unsupported file type: .${ext}. Please upload CSV or Excel files.`);
      }

      if (data.length === 0) throw new Error('No data rows found in the file.');

      setFileName(file.name);
      setRawData(data);
      const ana = analyzeData(data, file.name.replace(/\.[^.]+$/, ''));
      setAnalysis(ana);
      setActiveTab('analyze');

      setChatMessages((prev) => [...prev,
        { role: 'user', text: `Uploaded ${file.name} (${data.length.toLocaleString()} rows, ${ana.columns.length} columns)`, timestamp: Date.now() },
        { role: 'assistant', text: `Loaded "${file.name}" successfully! Found ${data.length.toLocaleString()} rows with ${ana.columns.length} columns.\n\n**Column summary:**\n${ana.numericCols.length > 0 ? `\u2022 Numeric: ${ana.numericCols.join(', ')}\n` : ''}${ana.categoricalCols.length > 0 ? `\u2022 Categorical: ${ana.categoricalCols.join(', ')}\n` : ''}${ana.dateCols.length > 0 ? `\u2022 Date: ${ana.dateCols.join(', ')}\n` : ''}${ana.booleanCols.length > 0 ? `\u2022 Boolean: ${ana.booleanCols.join(', ')}\n` : ''}${ana.correlations.length > 0 ? `\u2022 Strong correlations: ${ana.correlations.slice(0, 3).map((c) => `${c.col1} \u2194 ${c.col2} (r=${c.r})`).join(', ')}\n` : ''}\nType "generate dashboard" to auto-create a full dashboard, or explore the tabs above.` , timestamp: Date.now() },
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const toggleSelection = useCallback((set: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) => {
    set((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }, []);

  const charts = useMemo(() => analysis ? suggestCharts(analysis) : [], [analysis]);
  const kpis = useMemo(() => analysis ? suggestKPIs(analysis) : [], [analysis]);
  const filters = useMemo(() => analysis ? suggestFilters(analysis) : [], [analysis]);
  const calcs = useMemo(() => analysis ? suggestCalculatedFields(analysis) : [], [analysis]);

  const handleGenerateAll = useCallback(() => {
    if (!analysis || !rawData) return;
    setSelectedCharts(new Set(charts.filter((c) => c.type !== 'kpi' && c.type !== 'table').slice(0, 6).map((c) => c.id)));
    setSelectedKpis(new Set(kpis.slice(0, 6).map((k) => k.id)));
    setSelectedFilters(new Set(filters.slice(0, 4).map((f) => f.id)));
    setSelectedCalcs(new Set(calcs.slice(0, 4).map((c) => c.id)));
    setActiveTab('suggest');
  }, [analysis, rawData, charts, kpis, filters, calcs]);

  const handleApplyToDashboard = useCallback(() => {
    if (!analysis || !rawData || !onApplyDashboard) return;
    const blueprint = generateDashboardBlueprint(analysis, rawData);

    const filteredWidgets: WidgetConfig[] = [];
    for (const w of blueprint.widgets) {
      if (w.type === 'chart' && !selectedCharts.has(w.id)) continue;
      if (w.type === 'kpi' && !selectedKpis.has(w.id)) continue;
      if (w.type === 'filter' && !selectedFilters.has(w.id)) continue;
      filteredWidgets.push(w);
    }

    const config: DashboardConfig = {
      id: `ai-dashboard-${Date.now()}`,
      title: blueprint.title,
      description: blueprint.description,
      version: '1.0.0',
      theme: 'light',
      widgets: filteredWidgets.length > 0 ? filteredWidgets : blueprint.widgets,
      variables: blueprint.variables,
      datasets: blueprint.datasets,
    };

    onApplyDashboard(config);
    setShowApplyConfirm(false);
    setChatMessages((prev) => [...prev,
      { role: 'assistant', text: `Dashboard "${config.title}" applied with ${config.widgets.length} widgets!`, timestamp: Date.now() },
    ]);
  }, [analysis, rawData, onApplyDashboard, selectedCharts, selectedKpis, selectedFilters]);

  const handleSendChat = useCallback(() => {
    if (!chatInput.trim() || !analysis) return;
    const userMsg: ChatMessage = { role: 'user', text: chatInput.trim(), timestamp: Date.now() };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput('');

    const result = processNL(chatInput.trim(), analysis);
    const assistantMsg: ChatMessage = { role: 'assistant', text: result.response, timestamp: Date.now() };
    setChatMessages((prev) => [...prev, assistantMsg]);

    for (const action of result.actions) {
      if (action.type === 'generate_all') handleGenerateAll();
      if (action.type === 'set_title' && rawData) {
        const ana = analyzeData(rawData, (action.payload as { title: string }).title);
        setAnalysis(ana);
      }
    }

    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }, [chatInput, analysis, rawData, handleGenerateAll]);

  const handleExplain = useCallback((chart: ChartSuggestion) => {
    if (!analysis) return;
    const text = explainChart(chart, analysis);
    setExplanation(text);
  }, [analysis]);

  const tabs: { key: AITab; label: string; icon: string; badge?: number }[] = [
    { key: 'upload', label: 'Upload', icon: '\u2191' },
    { key: 'analyze', label: 'Analyze', icon: '\u2261', badge: analysis ? analysis.columns.length : undefined },
    { key: 'suggest', label: 'Suggest', icon: '\u2606', badge: charts.length + kpis.length },
    { key: 'nl', label: 'Chat', icon: '\u2709' },
  ];

  return (
    <div className="ai-root">
      <div className="ai-tabs">
        {tabs.map((t) => (
          <button key={t.key} className={`ai-tab ${activeTab === t.key ? 'active' : ''}`} onClick={() => setActiveTab(t.key)}>
            <span className="ai-tab-icon">{t.icon}</span>
            {t.label}
            {t.badge !== undefined && <span className="ai-tab-badge">{t.badge}</span>}
          </button>
        ))}
      </div>
      <div className="ai-content">
        {activeTab === 'upload' && <UploadTab onFile={handleFile} loading={loading} error={error} fileName={fileName} fileType={fileType} rowCount={rawData?.length} />}
        {activeTab === 'analyze' && analysis && <AnalyzeTab analysis={analysis} />}
        {activeTab === 'suggest' && analysis && (
          <SuggestTab
            charts={charts} kpis={kpis} filters={filters} calcs={calcs}
            selectedCharts={selectedCharts} selectedKpis={selectedKpis} selectedFilters={selectedFilters} selectedCalcs={selectedCalcs}
            onToggleChart={(id) => toggleSelection(setSelectedCharts, id)}
            onToggleKpi={(id) => toggleSelection(setSelectedKpis, id)}
            onToggleFilter={(id) => toggleSelection(setSelectedFilters, id)}
            onToggleCalc={(id) => toggleSelection(setSelectedCalcs, id)}
            onGenerateAll={handleGenerateAll}
            onApply={onApplyDashboard ? () => setShowApplyConfirm(true) : undefined}
            onExplain={handleExplain}
          />
        )}
        {activeTab === 'nl' && <NLTab messages={chatMessages} input={chatInput} onInputChange={setChatInput} onSend={handleSendChat} hasData={!!analysis} chatEndRef={chatEndRef} />}
      </div>

      {explanation && (
        <div className="ai-modal-backdrop" onClick={() => setExplanation(null)}>
          <div className="ai-explain-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ai-explain-header">
              <h4>Chart Explanation</h4>
              <button onClick={() => setExplanation(null)}>Close</button>
            </div>
            <div className="ai-explain-body" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(explanation.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>')) }} />
          </div>
        </div>
      )}

      {showApplyConfirm && (
        <div className="ai-modal-backdrop" onClick={() => setShowApplyConfirm(false)}>
          <div className="ai-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h4>Apply to Dashboard?</h4>
            <p>This will replace the current dashboard with the AI-generated layout. You can undo with "Versions" if needed.</p>
            <div className="ai-confirm-actions">
              <button className="ai-btn-primary" onClick={handleApplyToDashboard}>Apply</button>
              <button onClick={() => setShowApplyConfirm(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  Upload Tab                                                          */
/* ================================================================== */

function UploadTab({ onFile, loading, error, fileName, fileType, rowCount }: {
  onFile: (f: File) => void; loading: boolean; error: string; fileName: string; fileType: string; rowCount?: number;
}) {
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  }, [onFile]);

  const handleInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFile(file);
  }, [onFile]);

  return (
    <div className="ai-upload">
      <div
        className={`ai-dropzone ${dragOver ? 'dragover' : ''} ${loading ? 'loading' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
      >
        <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" onChange={handleInput} hidden />
        {loading ? (
          <div className="ai-drop-loading">
            <div className="ai-spinner" />
            <span>Processing file...</span>
          </div>
        ) : (
          <>
            <div className="ai-drop-icon">\u2191</div>
            <div className="ai-drop-title">Drop a file here or click to browse</div>
            <div className="ai-drop-desc">Supports CSV, TSV, and Excel (.xlsx, .xls) files</div>
          </>
        )}
      </div>

      {error && <div className="ai-error">{error}</div>}

      {fileName && !loading && (
        <div className="ai-file-info">
          <span className="ai-file-icon">{fileType === 'Excel' ? '\u2637' : '\u2261'}</span>
          <div className="ai-file-details">
            <span className="ai-file-name">{fileName}</span>
            <span className="ai-file-meta">{fileType}{rowCount !== undefined ? ` \u00b7 ${rowCount.toLocaleString()} rows` : ''}</span>
          </div>
        </div>
      )}

      <div className="ai-upload-tips">
        <h5>Tips</h5>
        <ul>
          <li>First row should contain column headers</li>
          <li>CSV files should be comma-delimited</li>
          <li>Excel files use the first sheet by default</li>
          <li>Date columns should be in YYYY-MM-DD format for best results</li>
          <li>For large files (100k+ rows), processing may take a moment</li>
        </ul>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Analyze Tab                                                         */
/* ================================================================== */

function AnalyzeTab({ analysis }: { analysis: DataAnalysis }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (name: string) => setExpanded((prev) => { const next = new Set(prev); if (next.has(name)) next.delete(name); else next.add(name); return next; });

  return (
    <div className="ai-analyze">
      <div className="ai-summary-grid">
        <div className="ai-summary-card"><span className="ai-sum-val">{analysis.rowCount.toLocaleString()}</span><span className="ai-sum-lbl">Rows</span></div>
        <div className="ai-summary-card"><span className="ai-sum-val">{analysis.columns.length}</span><span className="ai-sum-lbl">Columns</span></div>
        <div className="ai-summary-card"><span className="ai-sum-val">{analysis.numericCols.length}</span><span className="ai-sum-lbl">Numeric</span></div>
        <div className="ai-summary-card"><span className="ai-sum-val">{analysis.categoricalCols.length}</span><span className="ai-sum-lbl">Categorical</span></div>
        <div className="ai-summary-card"><span className="ai-sum-val">{analysis.dateCols.length}</span><span className="ai-sum-lbl">Dates</span></div>
        <div className="ai-summary-card"><span className="ai-sum-val">{analysis.correlations.length}</span><span className="ai-sum-lbl">Correlations</span></div>
      </div>

      {analysis.correlations.length > 0 && (
        <div className="ai-section">
          <h5>Notable Correlations</h5>
          {analysis.correlations.slice(0, 5).map((c) => (
            <div key={`${c.col1}-${c.col2}`} className="ai-corr-row">
              <span className="ai-corr-cols">{c.col1} \u2194 {c.col2}</span>
              <span className={`ai-corr-val ${c.r > 0 ? 'pos' : 'neg'}`}>r = {c.r}</span>
            </div>
          ))}
        </div>
      )}

      <div className="ai-section">
        <h5>Column Details</h5>
        <div className="ai-col-list">
          {analysis.columns.map((col) => (
            <div key={col.name} className="ai-col-card" onClick={() => toggle(col.name)}>
              <div className="ai-col-header">
                <span className={`ai-col-type-badge ${col.type}`}>{col.type}</span>
                <span className="ai-col-name">{col.name}</span>
                {col.isId && <span className="ai-col-badge">ID</span>}
                <span className="ai-col-unique">{col.uniqueCount} unique</span>
                <span className="ai-col-arrow">{expanded.has(col.name) ? '\u25b4' : '\u25be'}</span>
              </div>
              {expanded.has(col.name) && (
                <div className="ai-col-detail">
                  {col.type === 'number' && (
                    <div className="ai-col-stats">
                      <span>Min: {col.min?.toLocaleString()}</span>
                      <span>Max: {col.max?.toLocaleString()}</span>
                      <span>Mean: {col.mean?.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                      <span>Median: {col.median?.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                      <span>Std: {col.std?.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                      <span>Sum: {col.sum?.toLocaleString()}</span>
                    </div>
                  )}
                  {col.type === 'date' && (
                    <div className="ai-col-stats">
                      <span>From: {col.minDate}</span>
                      <span>To: {col.maxDate}</span>
                    </div>
                  )}
                  {col.topValues && (
                    <div className="ai-top-values">
                      <span className="ai-top-label">Top values:</span>
                      {col.topValues.slice(0, 5).map((tv) => (
                        <div key={tv.value} className="ai-top-row">
                          <span className="ai-top-val">{tv.value}</span>
                          <div className="ai-top-bar-bg"><div className="ai-top-bar" style={{ width: `${tv.pct}%` }} /></div>
                          <span className="ai-top-pct">{tv.pct}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Suggest Tab                                                         */
/* ================================================================== */

function SuggestTab({ charts, kpis, filters, calcs, selectedCharts, selectedKpis, selectedFilters, selectedCalcs, onToggleChart, onToggleKpi, onToggleFilter, onToggleCalc, onGenerateAll, onApply, onExplain }: {
  charts: ChartSuggestion[]; kpis: KPISuggestion[]; filters: FilterSuggestion[]; calcs: CalcFieldSuggestion[];
  selectedCharts: Set<string>; selectedKpis: Set<string>; selectedFilters: Set<string>; selectedCalcs: Set<string>;
  onToggleChart: (id: string) => void; onToggleKpi: (id: string) => void; onToggleFilter: (id: string) => void; onToggleCalc: (id: string) => void;
  onGenerateAll: () => void; onApply?: () => void; onExplain: (chart: ChartSuggestion) => void;
}) {
  const [section, setSection] = useState<'charts' | 'kpis' | 'filters' | 'calcs'>('charts');
  const totalSelected = selectedCharts.size + selectedKpis.size + selectedFilters.size + selectedCalcs.size;

  return (
    <div className="ai-suggest">
      <div className="ai-suggest-header">
        <div className="ai-suggest-section-tabs">
          {(['charts', 'kpis', 'filters', 'calcs'] as const).map((s) => (
            <button key={s} className={`ai-sec-btn ${section === s ? 'active' : ''}`} onClick={() => setSection(s)}>
              {s === 'charts' ? `Charts (${charts.length})` : s === 'kpis' ? `KPIs (${kpis.length})` : s === 'filters' ? `Filters (${filters.length})` : `Calcs (${calcs.length})`}
            </button>
          ))}
        </div>
        <div className="ai-suggest-actions">
          <button className="ai-btn-sm" onClick={onGenerateAll}>Select Best</button>
          {onApply && <button className="ai-btn-primary" onClick={onApply} disabled={totalSelected === 0}>Apply ({totalSelected})</button>}
        </div>
      </div>

      {section === 'charts' && (
        <div className="ai-card-grid">
          {charts.map((chart) => (
            <div key={chart.id} className={`ai-sug-card ${selectedCharts.has(chart.id) ? 'selected' : ''}`} onClick={() => onToggleChart(chart.id)}>
              <div className="ai-sug-header">
                <span className={`ai-sug-type ${chart.type}`}>{chart.type}</span>
                <span className="ai-sug-conf">{Math.round(chart.confidence * 100)}%</span>
              </div>
              <div className="ai-sug-title">{chart.title}</div>
              <div className="ai-sug-desc">{chart.description}</div>
              <div className="ai-sug-meta">
                {chart.x && <span>X: {chart.x}</span>}
                {chart.y && <span>Y: {chart.y}</span>}
                {chart.yAgg && <span>\u03a3 {chart.yAgg}</span>}
              </div>
              <button className="ai-sug-explain" onClick={(e) => { e.stopPropagation(); onExplain(chart); }}>Explain</button>
            </div>
          ))}
        </div>
      )}

      {section === 'kpis' && (
        <div className="ai-card-grid">
          {kpis.map((kpi) => (
            <div key={kpi.id} className={`ai-sug-card ai-kpi-card ${selectedKpis.has(kpi.id) ? 'selected' : ''}`} onClick={() => onToggleKpi(kpi.id)}>
              <div className="ai-kpi-preview" style={{ borderColor: kpi.color }}>
                <span className="ai-kpi-icon" style={{ color: kpi.color }}>{kpi.icon}</span>
                <span className="ai-kpi-name">{kpi.title}</span>
              </div>
              <div className="ai-sug-desc">{kpi.description}</div>
              <div className="ai-sug-meta"><span>\u03a3 {kpi.aggregation}</span><span>{kpi.field}</span></div>
            </div>
          ))}
        </div>
      )}

      {section === 'filters' && (
        <div className="ai-card-grid">
          {filters.map((f) => (
            <div key={f.id} className={`ai-sug-card ${selectedFilters.has(f.id) ? 'selected' : ''}`} onClick={() => onToggleFilter(f.id)}>
              <div className="ai-sug-header">
                <span className={`ai-sug-type filter`}>{f.filterType}</span>
                {f.defaultEnabled && <span className="ai-sug-badge">Default</span>}
              </div>
              <div className="ai-sug-title">{f.label}</div>
              <div className="ai-sug-meta">
                <span>Field: {f.field}</span>
                {f.options && <span>{f.options.length} options</span>}
                {f.min !== undefined && <span>{f.min} \u2013 {f.max}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {section === 'calcs' && (
        <div className="ai-card-grid">
          {calcs.map((c) => (
            <div key={c.id} className={`ai-sug-card ${selectedCalcs.has(c.id) ? 'selected' : ''}`} onClick={() => onToggleCalc(c.id)}>
              <div className="ai-sug-header">
                <span className="ai-sug-type calc">{c.category}</span>
              </div>
              <div className="ai-sug-title">{c.name}</div>
              <div className="ai-sug-desc">{c.description}</div>
              <code className="ai-calc-formula">{c.formula}</code>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  NL Chat Tab                                                         */
/* ================================================================== */

function NLTab({ messages, input, onInputChange, onSend, hasData, chatEndRef }: {
  messages: ChatMessage[]; input: string; onInputChange: (v: string) => void; onSend: () => void; hasData: boolean;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
}) {
  const handleKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); } };
  const quickActions = [
    'generate dashboard', 'suggest charts', 'add KPIs', 'add filters',
    'describe data', 'add calculated fields', 'help',
  ];

  return (
    <div className="ai-nl">
      <div className="ai-chat-messages">
        {messages.map((msg, i) => (
          <div key={i} className={`ai-msg ${msg.role}`}>
            <div className="ai-msg-avatar">{msg.role === 'assistant' ? 'AI' : 'U'}</div>
            <div className="ai-msg-body" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(formatMsg(msg.text)) }} />
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>
      {!hasData && messages.length <= 1 && (
        <div className="ai-quick-actions">
          {quickActions.map((qa) => (
            <button key={qa} className="ai-quick-btn" onClick={() => { onInputChange(qa); }}>{qa}</button>
          ))}
        </div>
      )}
      <div className="ai-chat-input-row">
        <textarea
          className="ai-chat-input"
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={handleKey}
          placeholder={hasData ? 'Ask me anything about your data...' : 'Upload data first, then ask questions...'}
          rows={1}
          disabled={!hasData}
        />
        <button className="ai-send-btn" onClick={onSend} disabled={!input.trim() || !hasData}>\u25b6</button>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Helpers                                                             */
/* ================================================================== */

function formatMsg(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\u2022 /g, '&bull; ')
    .replace(/\n/g, '<br/>');
}
