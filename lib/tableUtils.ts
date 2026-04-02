// @ts-nocheck
"use client"

import { useState, useEffect, useCallback, useRef, useReducer } from "react"
import { supabase } from "@/lib/supabase/client"
import { toast } from "@/lib/hooks/use-toast"

export interface TableColumn {
  column_name: string
  data_type: string
  is_jsonb: boolean
  jsonb_properties?: JsonbProperty[] | null
}

interface JsonbArrayConfig {
  fields: Array<{ id: string; name: string; type: string; parentField: string }>
  maxItems: number
}

interface JsonbProperty {
  id: string
  name: string
  type: string
  isArray?: boolean
  arrayConfig?: JsonbArrayConfig
}

export interface TableOption {
  name: string
  label: string
}

// Reducer for table fields
type FieldAction =
  | { type: 'SET_LOADING'; index: number; tableName: string }
  | { type: 'SET_FIELDS'; index: number; tableName: string; fields: TableColumn[] }
  | { type: 'CLEAR_LOADING'; index: number; tableName: string }

function fieldsReducer(state: Record<string, { fields: TableColumn[]; loading: boolean }>, action: FieldAction) {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, [`${action.index}-${action.tableName}`]: { fields: state[`${action.index}-${action.tableName}`]?.fields || [], loading: true } }
    case 'SET_FIELDS':
      return { ...state, [`${action.index}-${action.tableName}`]: { fields: action.fields, loading: false } }
    case 'CLEAR_LOADING':
      return { ...state, [`${action.index}-${action.tableName}`]: { ...state[`${action.index}-${action.tableName}`], loading: false } }
    default:
      return state
  }
}

// Hook for fetching available tables
export function useAvailableTables() {
  const [tables, setTables] = useState<TableOption[]>([])
  const [loadingTables, setLoadingTables] = useState(false)

  useEffect(() => {
    const fetchTables = async () => {
      setLoadingTables(true)
      try {
        const { data } = await supabase.rpc("get_all_tables")
        if (data) {
          setTables(data
            .filter((t: any) => !t.table_name.startsWith("pg_") && !t.table_name.startsWith("sql_"))
            .map((t: any) => ({ name: t.table_name, label: t.table_name }))
            .sort((a: any, b: any) => a.label.localeCompare(b.label))
          )
        }
      } catch (error) {
        console.error("Error fetching tables:", error)
        toast({ title: "Error", description: "Failed to fetch tables", variant: "destructive" })
      } finally {
        setLoadingTables(false)
      }
    }
    fetchTables()
  }, [])

  return { tables, loadingTables }
}

// Hook for managing table fields with caching
export function useTableFields() {
  const [fieldState, dispatchField] = useReducer(fieldsReducer, {})
  const fieldCacheRef = useRef<Record<string, TableColumn[]>>({})
  const fetchInProgressRef = useRef<Record<string, boolean>>({})

  const fetchFieldsForTable = useCallback(async (tableName: string, index: number = 0) => {
    if (!tableName) return

    const cacheKey = tableName
    if (fieldCacheRef.current[cacheKey]) {
      dispatchField({ type: 'SET_FIELDS', index, tableName, fields: fieldCacheRef.current[cacheKey] })
      return
    }

    const fetchKey = `${tableName}-${index}`
    if (fetchInProgressRef.current[fetchKey]) return
    fetchInProgressRef.current[fetchKey] = true

    dispatchField({ type: 'SET_LOADING', index, tableName })

    try {
      const { data, error } = await supabase.rpc("get_table_columns", { input_table_name: tableName })
      if (error) throw error
      fieldCacheRef.current[cacheKey] = data || []
      dispatchField({ type: 'SET_FIELDS', index, tableName, fields: data || [] })
    } catch (error) {
      console.error(`Error fetching columns for ${tableName}:`, error)
      toast({ title: "Error", description: `Failed to fetch columns for ${tableName}`, variant: "destructive" })
      dispatchField({ type: 'SET_FIELDS', index, tableName, fields: [] })
    } finally {
      delete fetchInProgressRef.current[fetchKey]
    }
  }, [])

  const getFieldsForTable = useCallback((tableName: string, index: number = 0) => {
    return fieldState[`${index}-${tableName}`]?.fields || []
  }, [fieldState])

  const getLoadingForTable = useCallback((tableName: string, index: number = 0) => {
    return fieldState[`${index}-${tableName}`]?.loading || false
  }, [fieldState])

  return {
    fetchFieldsForTable,
    getFieldsForTable,
    getLoadingForTable
  }
}

// Combined hook for both tables and fields
export function useTableData() {
  const { tables, loadingTables } = useAvailableTables()
  const { fetchFieldsForTable, getFieldsForTable, getLoadingForTable } = useTableFields()

  return {
    tables,
    loadingTables,
    fetchFieldsForTable,
    getFieldsForTable,
    getLoadingForTable
  }
}
