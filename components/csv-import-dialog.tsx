"use client";

import type React from "react";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Upload, X, AlertCircle, CheckCircle2 } from "lucide-react";
import { parseCSV } from "@/lib/csv-service";
import { batchImportAttendees } from "@/lib/firebase-service";

interface CSVImportDialogProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function CSVImportDialog({ onClose, onSuccess }: CSVImportDialogProps) {
  const [csvContent, setCSVContent] = useState("");
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setCSVContent(content);
      setParseErrors([]);
    };
    reader.readAsText(file);
  };

  const handleParse = () => {
    const result = parseCSV(csvContent);
    if (!result.valid) {
      setParseErrors(result.errors);
    } else {
      setParseErrors([]);
    }
  };

  const handleImport = async () => {
    const result = parseCSV(csvContent);
    if (!result.valid) {
      setParseErrors(result.errors);
      return;
    }

    try {
      setIsImporting(true);
      const importResult = await batchImportAttendees(result.data);
      setImportResult(importResult);

      if (importResult.failed === 0) {
        setTimeout(() => {
          onSuccess();
          onClose();
        }, 2000);
      }
    } catch (err) {
      console.error("[v0] Import failed:", err);
      setParseErrors(["Failed to import attendees. Please try again."]);
    } finally {
      setIsImporting(false);
    }
  };

  // Template kept in codebase but no longer exposed in UI
  const handleDownloadTemplate = () => {
    const template = `ticketNumber,name,table,seat
TICKET001,John Doe,1,1
TICKET002,Jane Smith,1,2`;
    // downloadCSV(template, "attendees_template.csv");
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <Card className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="flex items-center justify-between p-6 border-b border-blue-200 sticky top-0 bg-white">
          <h2 className="text-2xl font-bold text-slate-900">Import Attendees from CSV</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Instructions */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-slate-900 mb-2">Required CSV Format</h3>
            <p className="text-slate-600 text-sm mb-2">Your CSV must include these columns:</p>
            <ul className="text-slate-600 text-sm space-y-1 ml-4">
              <li>• ticketNumber (required)</li>
              <li>• name (required)</li>
              <li>• table (optional)</li>
              <li>• seat (optional)</li>
              <li>• Check-in Status (optional: "Checked In" / "Pending")</li>
              <li>• Check-in Time (optional, ISO date or any parseable date)</li>
              {/* region & category are no longer required; if present they are just imported as-is */}
            </ul>
          </div>

          {/* File Upload */}
          <div>
            <label className="text-slate-700 text-sm font-medium block mb-2">Select CSV File</label>
            <div className="border-2 border-dashed border-blue-300 rounded-lg p-6 text-center">
              <Input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" id="csv-upload" />
              <label htmlFor="csv-upload" className="cursor-pointer">
                <Upload className="w-8 h-8 text-blue-500 mx-auto mb-2" />
                <p className="text-slate-900 font-medium">Click to select CSV file</p>
                <p className="text-slate-500 text-sm">or drag and drop</p>
              </label>
            </div>
            {csvContent && <p className="text-emerald-700 text-sm mt-2">CSV file loaded successfully</p>}
          </div>

          {/* Parse Errors */}
          {parseErrors.length > 0 && (
            <div className="bg-red-50 border border-red-300 rounded-lg p-4 space-y-2">
              <div className="flex gap-2 items-start">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-red-900">Import Errors:</p>
                  <ul className="text-red-700 text-sm space-y-1 mt-2">
                    {parseErrors.slice(0, 10).map((err, i) => (
                      <li key={i}>• {err}</li>
                    ))}
                    {parseErrors.length > 10 && <li>• ... and {parseErrors.length - 10} more errors</li>}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Import Result */}
          {importResult && (
            <div
              className={`rounded-lg p-4 border ${
                importResult.failed === 0 ? "bg-emerald-50 border-emerald-300" : "bg-amber-50 border-amber-300"
              }`}
            >
              <div className="flex gap-3 items-start">
                <CheckCircle2
                  className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                    importResult.failed === 0 ? "text-emerald-600" : "text-amber-600"
                  }`}
                />
                <div>
                  <p className={`font-medium ${importResult.failed === 0 ? "text-emerald-900" : "text-amber-900"}`}>
                    Import Complete
                  </p>
                  <p className={`text-sm mt-1 ${importResult.failed === 0 ? "text-emerald-700" : "text-amber-700"}`}>
                    Successfully imported: {importResult.successful} attendees
                    {importResult.failed > 0 && ` | Failed: ${importResult.failed}`}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-blue-200 bg-blue-50 flex gap-3 justify-between sticky bottom-0">
          {/* Download Template button kept in code but disabled / hidden from UI */}
          {/* 
          <Button
            onClick={handleDownloadTemplate}
            variant="outline"
            className="border-blue-200 text-blue-600 bg-transparent"
          >
            Download Template
          </Button>
          */}
          <div /> {/* spacer to keep layout similar */}

          <div className="flex gap-3">
            <Button onClick={onClose} variant="outline" className="border-blue-200 text-blue-600 bg-transparent">
              Cancel
            </Button>
            {!importResult ? (
              <>
                <Button
                  onClick={handleImport}
                  disabled={!csvContent || isImporting || parseErrors.length > 0}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {isImporting ? "Importing..." : "Import"}
                </Button>
              </>
            ) : (
              <Button onClick={onClose} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                Done
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}