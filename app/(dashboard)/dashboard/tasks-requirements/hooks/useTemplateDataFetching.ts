// @ts-nocheck
import { useState, useCallback, useRef } from 'react';
import supabase from "@/lib/supabase/client";
import { executeComputedField } from '../../tasks/utils/automationComputedFunctions';

interface UseTemplateDataFetchingProps {
  isOpen: boolean;
  selectedTemplate: any;
  masterFields: Map<number, any>;
  entityIdMap: any;
  relationshipData: any;
  computedFieldCache: Record<string, any>;
  setComputedFieldCache: (cache: Record<string, any>) => void;
  setAdditionalCache: (cache: Record<string, any>) => void;
  setDocumentTablesReady: (ready: boolean) => void;
}

export const useTemplateDataFetching = ({
  isOpen,
  selectedTemplate,
  masterFields,
  entityIdMap,
  relationshipData,
  computedFieldCache,
  setComputedFieldCache,
  setAdditionalCache,
  setDocumentTablesReady,
}: UseTemplateDataFetchingProps) => {
  const fetchedTablesRef = useRef<Set<string>>(new Set());
  const computedFieldsResolvedRef = useRef<string | null>(null);

  const fetchMissingDataSources = useCallback(async () => {
    if (!isOpen || !selectedTemplate || !masterFields) return;

    const allIds = new Set<string>();

    if (entityIdMap.company) allIds.add(String(entityIdMap.company));
    if (entityIdMap.principal) allIds.add(String(entityIdMap.principal));
    if (entityIdMap.sponsor) allIds.add(String(entityIdMap.sponsor));

    const dirIds = Array.isArray(entityIdMap.directors)
      ? entityIdMap.directors
      : (entityIdMap.director ? [entityIdMap.director] : []);
    dirIds.forEach(id => id && allIds.add(String(id)));

    const depIds = Array.isArray(entityIdMap.dependants) ? entityIdMap.dependants : [];
    depIds.forEach(id => id && allIds.add(String(id)));

    relationshipData?.directors?.forEach(d => (d.id || d.director_id) && allIds.add(String(d.id || d.director_id)));
    relationshipData?.dependants?.forEach(d => {
      const id = typeof d === 'object' ? (d.id || d.individual_id) : d;
      if (id) allIds.add(String(id));
    });
    if (relationshipData?.principal) {
      const p = relationshipData.principal;
      const pid = typeof p === 'object' ? (p.id || p.individual_id) : p;
      if (pid) allIds.add(String(pid));
    }
    if (relationshipData?.sponsor) {
      const s = relationshipData.sponsor;
      const sid = typeof s === 'object' ? (s.id || s.individual_id) : s;
      if (sid) allIds.add(String(sid));
    }

    const idList = Array.from(allIds).filter(Boolean);
    if (idList.length === 0) return;

    interface TableConfig {
      linkingVars: Set<string>;
      documentIds: Set<string>;
      hasDocFilter: boolean;
    }

    const tableConfigs = new Map<string, TableConfig>();

    selectedTemplate.placeholders?.forEach(p => {
      const allLinkedMasterIds = new Set([
        ...(p.master_field_ids || []),
        ...(p.conditions?.map((c: any) => c.master_field_id).filter(Boolean) || []),
        ...(p.conditions?.map((c: any) => c.comparison?.master_field_id).filter(Boolean) || []),
        ...(p.conditions?.flatMap((c: any) => (c.additional_comparisons || []).map((ac: any) => ac.master_field_id)).filter(Boolean) || []),
        ...(p.boolean_conditions?.map((c: any) => c.master_field_id).filter(Boolean) || []),
      ]);

      allLinkedMasterIds.forEach(mId => {
        const masterField = masterFields.get(parseInt(mId));
        masterField?.sources?.forEach((source: any) => {
          if (!source.table) return;

          if (!tableConfigs.has(source.table)) {
            tableConfigs.set(source.table, {
              linkingVars: new Set(),
              documentIds: new Set(),
              hasDocFilter: false,
            });
          }

          const cfg = tableConfigs.get(source.table)!;
          cfg.linkingVars.add(source.linking_variable || 'id');

          const docIds: string[] = Array.isArray(source.document_id)
            ? source.document_id
            : (source.document_id ? [source.document_id] : []);

          if (docIds.length > 0) {
            docIds.forEach(id => cfg.documentIds.add(id));
            cfg.hasDocFilter = true;
          }
        });
      });
    });

    const tablesToFetch = Array.from(tableConfigs.keys());

    try {
      const fetchPromises = Array.from(tableConfigs.entries()).map(async ([table, config]) => {
        try {
          const linkingVars = Array.from(config.linkingVars);
          const docIds = Array.from(config.documentIds);

          let query = supabase.from(table).select('*');

          if (linkingVars.length === 1) {
            query = query.in(linkingVars[0], idList);
          } else {
            const orConditions = linkingVars
              .map(lv => `${lv}.in.(${idList.join(',')})`)
              .join(',');
            query = query.or(orConditions);
          }

          if (config.hasDocFilter && docIds.length > 0) {
            const { data: docRows, error: docErr } = await supabase
              .from(table)
              .select('*')
              .in('document_id', docIds)
              .in(linkingVars[0], idList);

            if (!docErr && docRows) {
              const { data: mainRows, error: mainErr } = await query;
              if (mainErr) throw mainErr;

              const combined = [...(mainRows || []), ...docRows];
              const seen = new Set<string>();
              const deduped = combined.filter(row => {
                const key = String(row.id || row.director_id || row.individual_id || row.company_id);
                if (seen.has(key + JSON.stringify(row))) return false;
                seen.add(key + JSON.stringify(row));
                return true;
              });

              const tableCache: Record<string, any> = {};
              deduped.forEach(row => {
                const primaryId = String(row.id || row.director_id || row.individual_id || row.company_id);
                if (primaryId && primaryId !== 'undefined') tableCache[primaryId] = row;
                linkingVars.forEach(v => { if (row[v]) tableCache[String(row[v])] = row; });
                if (row.document_id) tableCache[`doc_${row.document_id}_${String(row[linkingVars[0]])}`] = row;
              });

              return { table, cache: tableCache };
            }
          }

          const { data, error } = await query;
          if (error) throw error;

          const tableCache: Record<string, any> = {};
          data?.forEach(row => {
            const primaryId = String(row.id || row.director_id || row.individual_id || row.company_id);
            if (primaryId && primaryId !== 'undefined') tableCache[primaryId] = row;
            linkingVars.forEach(v => { if (row[v]) tableCache[String(row[v])] = row; });
            if (row.document_id) tableCache[`doc_${row.document_id}_${String(row[linkingVars[0]])}`] = row;
          });
          return { table, cache: tableCache };
        } catch (err) {
          console.error(`Error fetching ${table}:`, err);
          return { table, cache: null };
        }
      });

      const results = await Promise.all(fetchPromises);
      const newCacheEntries: Record<string, any> = {};

      results.forEach(res => {
        if (res.cache) {
          newCacheEntries[res.table] = res.cache;
        }
      });

      if (Object.keys(newCacheEntries).length > 0) {
        setAdditionalCache(prev => ({ ...prev, ...newCacheEntries }));
      }
    } catch (error) {
      console.error('Data load failed:', error);
    }
  }, [isOpen, selectedTemplate, masterFields, entityIdMap, relationshipData, setAdditionalCache]);

  const resolveComputedFields = useCallback(async (_updatedCache: Record<string, any>) => {
    if (!selectedTemplate?.placeholders || !masterFields) return;

    const resolutionKey = `${selectedTemplate.id}_${JSON.stringify(entityIdMap)}`;
    if (computedFieldsResolvedRef.current === resolutionKey) {
      return;
    }

    const allEntityIds = new Set<string>();

    if (entityIdMap?.company) allEntityIds.add(String(entityIdMap.company));
    if (entityIdMap?.principal) allEntityIds.add(String(entityIdMap.principal));
    if (entityIdMap?.sponsor) allEntityIds.add(String(entityIdMap.sponsor));

    const dirIds = Array.isArray(entityIdMap?.directors)
      ? entityIdMap.directors
      : (entityIdMap?.director ? [entityIdMap.director] : []);
    dirIds.forEach((id: any) => id && allEntityIds.add(String(id)));

    const addAllIds = (obj: any) => {
      if (!obj) return;
      if (typeof obj !== 'object') { allEntityIds.add(String(obj)); return; }
      [obj.id, obj.director_id, obj.individual_id, obj.company_id]
        .filter(Boolean)
        .forEach((id: any) => allEntityIds.add(String(id)));
    };
    relationshipData?.directors?.forEach(addAllIds);
    relationshipData?.dependants?.forEach(addAllIds);
    addAllIds(relationshipData?.principal);
    addAllIds(relationshipData?.sponsor);

    const entityIdArray = Array.from(allEntityIds).filter(Boolean);
    if (entityIdArray.length === 0) { setDocumentTablesReady(true); return; }

    const allLinkedMasterIds = new Set<number>();
    selectedTemplate.placeholders.forEach((p: any) => {
      const ids = [
        ...(p.master_field_ids || []),
        ...(p.conditions?.map((c: any) => c.master_field_id).filter(Boolean) || []),
        ...(p.conditions?.map((c: any) => c.comparison?.master_field_id).filter(Boolean) || []),
        ...(p.conditions?.flatMap((c: any) => (c.additional_comparisons || []).map((ac: any) => ac.master_field_id)).filter(Boolean) || []),
        ...(p.boolean_conditions?.map((c: any) => c.master_field_id).filter(Boolean) || []),
      ];
      ids.forEach((id: any) => allLinkedMasterIds.add(parseInt(id)));
    });

    interface PlanEntry {
      linkingVar: string;
      docIds: Set<string>;
      isDocScoped: boolean;
    }

    const tableFetchPlan = new Map<string, PlanEntry>();

    const ensureTable = (table: string, linkingVar: string, docIds: string[] = []) => {
      if (!table) return;
      if (!tableFetchPlan.has(table)) {
        tableFetchPlan.set(table, {
          linkingVar: linkingVar || 'id',
          docIds: new Set(),
          isDocScoped: false,
        });
      }
      const entry = tableFetchPlan.get(table)!;
      if (!entry.linkingVar) entry.linkingVar = linkingVar || 'id';
      if (docIds.length > 0) {
        docIds.forEach(id => entry.docIds.add(id));
        entry.isDocScoped = true;
      }
    };

    const computedJobs: Array<{ mfId: number; source: any }> = [];

    allLinkedMasterIds.forEach(mfId => {
      const mf = masterFields.get(mfId);
      if (!mf?.sources) return;

      mf.sources.forEach((source: any) => {
        if (!source.table) return;

        const docIds: string[] = Array.isArray(source.document_id)
          ? source.document_id.filter(Boolean)
          : (source.document_id ? [source.document_id] : []);

        if (source.is_computed) {
          ensureTable(source.table, source.linking_variable, docIds);
          computedJobs.push({ mfId, source });
        } else {
          ensureTable(source.table, source.linking_variable, docIds);
        }
      });
    });

    selectedTemplate.placeholders.forEach((p: any) => {
      if (p.type === 'document_checklist' && p.checklist_data_sources) {
        p.checklist_data_sources.forEach((ds: any) => {
          ensureTable(ds.table, ds.linking_variable, ds.linked_document_ids || []);
        });
      }
      if (p.type === 'image' && p.source_table) {
        ensureTable(p.source_table, p.linking_variable, p.document_type_ids || []);
      }
    });

    const documentCache: { documents: any[]; docTypes: any[] } = {
      documents: [],
      docTypes: [],
    };

    try {
      const fetchPromises: Promise<void>[] = [];

      tableFetchPlan.forEach((entry, table) => {
        const { linkingVar, docIds, isDocScoped } = entry;
        const docIdsArray = Array.from(docIds);

        let q = supabase
          .from(table)
          .select('*')
          .in(linkingVar, entityIdArray);

        if (isDocScoped && docIdsArray.length > 0) {
          q = q.in('document_id', docIdsArray);
        }

        fetchPromises.push(
          q.then(({ data, error }) => {
            if (error) {
              console.error(`fetch ${table}:`, error.message);
              return;
            }
            if (!data?.length) return;

            documentCache.documents.push(...data);

            const tableCache: Record<string, any> = {};
            data.forEach((row: any) => {
              const pk = String(row.id ?? row.director_id ?? row.individual_id ?? row.company_id ?? '');
              if (pk && pk !== 'undefined') tableCache[pk] = row;

              const lv = row[linkingVar];
              if (lv) tableCache[String(lv)] = row;

              if (row.document_id) {
                tableCache[`doc_${row.document_id}_${String(row[linkingVar] ?? pk)}`] = row;
              }
            });

            setAdditionalCache(prev => ({
              ...prev,
              [table]: { ...(prev[table] || {}), ...tableCache },
            }));
          }).catch(err => {
            console.error(`fetch ${table}:`, err);
          })
        );
      });

      const allDocIds = new Set<string>();
      tableFetchPlan.forEach(entry => entry.docIds.forEach(id => allDocIds.add(id)));
      if (allDocIds.size > 0) {
        fetchPromises.push(
          supabase
            .from('acc_portal_kyc')
            .select('*')
            .in('id', Array.from(allDocIds))
            .then(({ data }) => { if (data) documentCache.docTypes.push(...data); })
            .catch(() => { })
        );
      }

      await Promise.all(fetchPromises);
    } catch (err) {
      console.error('fetch phase failed:', err);
    }

    setDocumentTablesReady(true);
    if (computedJobs.length === 0) return;

    const newComputedCache: Record<string, any> = {};

    await Promise.all(
      computedJobs.flatMap(({ mfId, source }) =>
        entityIdArray.map(async (entityId) => {
          const extractionMode = 'latest';
          const cacheKey = `${mfId}_${entityId}_${extractionMode}`;

          if (computedFieldCache[cacheKey] !== undefined) {
            newComputedCache[cacheKey] = computedFieldCache[cacheKey];
            return;
          }

          const docIds: string[] = Array.isArray(source.document_id)
            ? source.document_id.filter(Boolean)
            : (source.document_id ? [source.document_id] : []);

          let functionToCall: string = source.computed_function || 'extractFieldFromLatestDocument';
          if (functionToCall === 'getLatestDocument' && source.path) {
            functionToCall = 'extractFieldFromLatestDocument';
          }

          try {
            const val = await executeComputedField(
              functionToCall,
              entityId,
              docIds,
              source.path,
              extractionMode,
              documentCache,
              source.computed_config,
            );
            newComputedCache[cacheKey] = val;
          } catch (err) {
            console.error(`computedField mf=${mfId} entity=${entityId}:`, err);
            newComputedCache[cacheKey] = null;
          }
        })
      )
    );

    if (Object.keys(newComputedCache).length > 0) {
      setComputedFieldCache(prev => ({ ...prev, ...newComputedCache }));
    }

    computedFieldsResolvedRef.current = resolutionKey;
  }, [
    selectedTemplate,
    masterFields,
    entityIdMap,
    relationshipData,
    computedFieldCache,
    setComputedFieldCache,
    setAdditionalCache,
    setDocumentTablesReady,
  ]);

  return {
    fetchMissingDataSources,
    resolveComputedFields,
  };
};
