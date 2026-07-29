import type { InventoryItem } from "./inventory"

export interface QBItemLite {
    Id: string;
    Name: string;
    Sku?: string;
    Description?: string;
    Type?: string;
    UnitPrice?: number;
    PurchaseCost?: number;
    QtyOnHand?: number;
    Active?: boolean;
}

export interface MappedQBItem {
    inventory_item_id: string;
    external_id: string;
}

export interface ImportQBItemResult{
    item: InventoryItem;
    warning?: string;
}

export interface QBTaxCodeLite {
    id: string;
    name: string;
    rates: { id: string; name: string; rate: number }[];
    totalRate: number;
}

export interface QBImportableInvoice {
    Id: string;
    DocNumber: string | null;
    TxnDate: string | null;
    DueDate: string | null;
    TotalAmt: number;
    customerId: string | null;
    customerName: string | null;
    lineCount: number;
    alreadyImported: boolean;
}

export interface QBInvoiceImportResult {
    imported: number;
    skipped: number;
    errors: string[];
}

export interface QBInvoicePrefillLineItem {
    name: string;
    description: string | null;
    quantity: number;
    unit_price: number;
    inventory_item_id: string | null;
}

export interface QBInvoicePrefill {
    qbInvoiceId: string;
    docNumber: string | null;
    txnDate: string | null;
    dueDate: string | null;
    memo: string | null;
    customerId: string | null;
    customerName: string | null;
    clientId: string | null;
    alreadyImported: boolean;
    lineItems: QBInvoicePrefillLineItem[];
}

export interface QBProfitAndLossQuery {
    customer?: string;
    start_date?: string;
    end_date?: string;
    accounting_method?: "Cash" | "Accrual";
    date_macro?: string;
    summarize_column_by?: string;
    class?: string;
    department?: string;
    vendor?: string;
    item?: string;
    sort_order?: "ascend" | "descend";
    qzurl?: "true" | "false";
    adjusted_gain_loss?: "true" | "false";
}

export interface QBProfitAndLossReport {
  Header: ReportHeader;
  Rows: ReportRows;
  Columns: ReportColumns;
}

interface ReportHeader {
  Customer?: string;
  ReportName: string;
  ReportBasis: string;
  StartPeriod: string;
  EndPeriod: string;
  Currency?: string;
  Time: string;
  SummarizeColumnsBy?: string;
  Option?: ReportOption[];
}

interface ReportOption {
  Name: string;
  Value: string;
}

interface ReportColumns {
  Column: ReportColumn[];
}

interface ReportColumn {
  ColType: string;
  ColTitle: string;
  MetaData?: ReportMetaData[];
}

interface ReportMetaData {
  Name: string;
  Value: string;
}

interface ReportRows {
  Row: ReportRow[];
}

interface ReportRow {
  type: "Section" | "Data" | string;
  group?: string;

  Header?: ReportHeaderRow;
  Rows?: ReportRows;
  Summary?: ReportSummary;

  ColData?: ReportColData[];
}

interface ReportHeaderRow {
  ColData: ReportColData[];
}

interface ReportSummary {
  ColData: ReportColData[];
}

interface ReportColData {
  id?: string;
  value: string;
}