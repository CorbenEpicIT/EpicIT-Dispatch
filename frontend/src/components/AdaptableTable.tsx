import React from "react";
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";
import { camelCaseToRegular, formatter } from "../util/util";
import LoadSvg from "../assets/icons/loading.svg?react";
import BoxSvg from "../assets/icons/box.svg?react";
import ErrSvg from "../assets/icons/error.svg?react";

interface AdaptableTableProps {
	data: Array<Record<string, unknown>>;
	borderColor?: string;
	formatNums?: boolean;
	loadListener?: boolean;
	errListener?: Error | null;
	onRowClick?: (row: Record<string, unknown>) => void;
	actionColumn?: {
		header: string;
		cell: (row: Record<string, unknown>) => React.ReactNode;
	};
}

const PADDING = "p-3";
const MIN_HEIGHT = 150;

const IGNORED_HEADERS: Record<string, boolean> = {
	id: true,
};

const AdaptableTable = ({
	data,
	borderColor,
	formatNums = true,
	loadListener,
	errListener,
	onRowClick,
	actionColumn,
}: AdaptableTableProps) => {
	const columns = React.useMemo(() => {
		if (data.length == 0) return [];

		const dataColumns = Object.keys(data[0])
			.filter((key) => !IGNORED_HEADERS[key])
			.map((key) => ({
				header: camelCaseToRegular(key),
				accessorKey: key,
			})) satisfies ColumnDef<Record<string, unknown>>[];

		// Add action column if provided
		if (actionColumn) {
			return [
				...dataColumns,
				{
					header: actionColumn.header,
					id: 'actions',
					cell: ({ row }: any) => actionColumn.cell(row.original),
				},
			] satisfies ColumnDef<Record<string, unknown>>[];
		}

		return dataColumns;
	}, [data, actionColumn]);

	const table = useReactTable({
		data,
		columns,
		getCoreRowModel: getCoreRowModel(),
	});

	if (!borderColor) borderColor = " border-border-subtle ";

	if (errListener) {
		return (
			<div
				className={`w-full h-${MIN_HEIGHT} flex flex-col justify-center content-center`}
			>
				<div>
					<ErrSvg className="m-auto mb-1 w-15 h-15" />

					<h1 className="m-auto text-center text-xl mt-1">
						An error has occurred.
					</h1>

					{/* this should be taken out in prod, just for debug purposes */}
					<h2 className="m-auto text-center text-text-muted">
						{errListener.message}
					</h2>
				</div>
			</div>
		);
	}

	if (data.length == 0 && !loadListener) {
		return (
			<div
				className={`w-full h-${MIN_HEIGHT} flex flex-col justify-center content-center`}
			>
				<div>
					<BoxSvg className="m-auto mb-1 w-15 h-15" />

					<h1 className="m-auto text-center text-xl mt-1">
						Nothing to display.
					</h1>
				</div>
			</div>
		);
	}

	return (
		<>
			{loadListener ? (
				<div
					className={`w-full h-${MIN_HEIGHT} flex flex-col justify-center content-center`}
				>
					<div>
						<LoadSvg className="m-auto mb-3 w-12 h-12" />

						<h1 className="m-auto text-center text-xl mt-3">
							Please wait...
						</h1>
					</div>
				</div>
			) : (
				<table className={`w-full h-full min-h-${MIN_HEIGHT} table-auto`}>
					<thead>
						{table.getHeaderGroups().map((headerGroup) => (
							<tr key={headerGroup.id}>
								{headerGroup.headers.map(
									(header) => (
										<th
											key={
												header.id
											}
											className={`sticky top-0 border-b font-bold text-text-tertiary ${borderColor} ${PADDING}`}
										>
											{flexRender(
												typeof header
													.column
													.columnDef
													.header ===
													"string"
													? camelCaseToRegular(
															header
																.column
																.columnDef
																.header
														)
													: header
															.column
															.columnDef
															.header,
												header.getContext()
											)}
										</th>
									)
								)}
							</tr>
						))}
					</thead>
					<tbody>
						{table.getRowModel().rows.map((row) => (
							<tr
								key={row.id}
								className={`text-left ${borderColor} ${onRowClick ? 'cursor-pointer hover:bg-surface transition-colors' : ''}`}
								onClick={() => onRowClick?.(row.original)}
							>
								{row
									.getVisibleCells()
									.map((cell) => (
										<td
											key={
												cell.id
											}
											className={`border-t border-border-subtle font-normal ${PADDING}`}
										>
											{(() => {
												// If this is the actions column, render the action cell
												if (cell.column.id === 'actions') {
													return flexRender(
														cell.column.columnDef.cell,
														cell.getContext()
													);
												}

												const rawValue =
													cell.getValue();
												if (
													formatNums
												) {
													if (
														typeof rawValue ===
														"number"
													)
														return formatter.format(
															rawValue
														);

													return flexRender(
														cell
															.column
															.columnDef
															.cell,
														cell.getContext()
													);
												}
												if (
													typeof rawValue ===
													"number"
												)
													return rawValue.toLocaleString();

												return flexRender(
													cell
														.column
														.columnDef
														.cell,
													cell.getContext()
												);
											})()}
										</td>
									))}
							</tr>
						))}
					</tbody>
				</table>
			)}
		</>
	);
};

export default AdaptableTable;