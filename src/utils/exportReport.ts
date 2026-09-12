import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { HARData, AnalysisResult } from '../types';

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Exports HAR analysis result as Markdown
 */
export function exportToMarkdown(harData: HARData, analysis: AnalysisResult): void {
  const timestamp = new Date().toLocaleString();
  const summary = analysis.summary;

  const markdown = `
# HAR Analysis Report
*Generated on ${timestamp}*

---

## 📊 Summary Metrics
- **Total Network Requests:** ${summary.totalRequests}
- **Failed Requests:** ${summary.failedRequests} (${((summary.failedRequests / (summary.totalRequests || 1)) * 100).toFixed(1)}%)
- **Average Response Time:** ${Math.round(summary.avgResponseTime)}ms
- **Total Payload Size:** ${formatBytes(summary.totalSize)}

---

## 💡 AI Diagnostic Advice
${analysis.advice}

---

## ⚠️ Identified Issues (${analysis.issues.length})
${analysis.issues.length === 0 ? '_No critical issues identified._' : analysis.issues.map(issue => 
  `- [${issue.type.toUpperCase()}] **${issue.title}**: ${issue.description}${issue.affectedUrl ? `\n  - *Affected URL:* \`${issue.affectedUrl}\`` : ''}`
).join('\n')}

---

## 🌐 Network Requests (${harData.log.entries.length})
| Status | Method | Time (ms) | Size | URL |
|:---:|:---:|:---:|:---:|:---|
${harData.log.entries.map(e => 
  `| ${e.response.status} | ${e.request.method} | ${Math.round(e.time)} | ${formatBytes(e.response.content.size || 0)} | ${e.request.url} |`
).join('\n')}
`.trim();

  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `har-analysis-${Date.now()}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Exports HAR analysis result as a styled PDF report
 */
export function exportToPdf(harData: HARData, analysis: AnalysisResult): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const timestamp = new Date().toLocaleString();
  const summary = analysis.summary;

  // Header banner
  doc.setFillColor(15, 23, 42); // Slate 900
  doc.rect(0, 0, pageWidth, 64, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('HAR Network Analysis Report', 36, 36);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(148, 163, 184); // Slate 400
  doc.text(`Generated: ${timestamp}`, 36, 52);

  // Summary Metrics Table
  autoTable(doc, {
    startY: 80,
    head: [['Metric', 'Value', 'Details']],
    body: [
      ['Total Requests', String(summary.totalRequests), 'Complete HTTP session'],
      ['Failed Requests', `${summary.failedRequests} (${((summary.failedRequests / (summary.totalRequests || 1)) * 100).toFixed(1)}%)`, 'Status codes >= 400'],
      ['Avg Response Time', `${Math.round(summary.avgResponseTime)} ms`, 'Overall network latency'],
      ['Total Payload Size', formatBytes(summary.totalSize), 'Transferred bandwidth']
    ],
    theme: 'striped',
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
    styles: { fontSize: 9, cellPadding: 5 },
    margin: { left: 36, right: 36 }
  });

  let currentY = (doc as any).lastAutoTable.finalY + 20;

  // Identified Issues Section
  if (analysis.issues && analysis.issues.length > 0) {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('Identified Issues', 36, currentY);

    const issuesData = analysis.issues.map(issue => [
      issue.type.toUpperCase(),
      issue.title,
      issue.description + (issue.affectedUrl ? `\nTarget: ${issue.affectedUrl}` : '')
    ]);

    autoTable(doc, {
      startY: currentY + 8,
      head: [['Severity', 'Issue', 'Description']],
      body: issuesData,
      theme: 'grid',
      headStyles: { fillColor: [71, 85, 105], textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 60, fontStyle: 'bold' },
        1: { cellWidth: 120 },
        2: { cellWidth: 'auto' }
      },
      styles: { fontSize: 8, cellPadding: 5 },
      margin: { left: 36, right: 36 }
    });

    currentY = (doc as any).lastAutoTable.finalY + 20;
  }

  // Top Failed / Slow Requests Table (Max 30)
  const notableEntries = harData.log.entries
    .filter(e => e.response.status >= 400 || e.time > 1000)
    .sort((a, b) => b.time - a.time)
    .slice(0, 30);

  if (notableEntries.length > 0) {
    if (currentY > 700) {
      doc.addPage();
      currentY = 40;
    }

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('Key Network Bottlenecks & Errors', 36, currentY);

    const entriesData = notableEntries.map(e => [
      String(e.response.status),
      e.request.method,
      `${Math.round(e.time)}ms`,
      formatBytes(e.response.content.size || 0),
      e.request.url.length > 70 ? e.request.url.substring(0, 70) + '...' : e.request.url
    ]);

    autoTable(doc, {
      startY: currentY + 8,
      head: [['Status', 'Method', 'Time', 'Size', 'URL']],
      body: entriesData,
      theme: 'striped',
      headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 45 },
        1: { cellWidth: 50 },
        2: { cellWidth: 50 },
        3: { cellWidth: 55 },
        4: { cellWidth: 'auto' }
      },
      styles: { fontSize: 8, cellPadding: 4 },
      margin: { left: 36, right: 36 }
    });
  }

  // Footer on all pages
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184);
    doc.text(
      `HAR Insight Analyzer • Page ${i} of ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 20,
      { align: 'center' }
    );
  }

  doc.save(`har-report-${Date.now()}.pdf`);
}
