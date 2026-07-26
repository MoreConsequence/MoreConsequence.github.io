"use client";

import { useEffect, useMemo, useState } from "react";
import {
  searchPosts,
  type SearchDocument,
} from "@/lib/search";

export function useSearch(isOpen: boolean) {
  const [documents, setDocuments] = useState<SearchDocument[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!isOpen || documents.length) return;
    fetch("/search-index.json")
      .then((response) => {
        if (!response.ok) throw new Error("搜索索引加载失败");
        return response.json() as Promise<SearchDocument[]>;
      })
      .then(setDocuments)
      .catch(() => setError(true));
  }, [documents.length, isOpen]);

  const results = useMemo(
    () => searchPosts(documents, query),
    [documents, query],
  );

  const loading = isOpen && documents.length === 0 && !error;

  return { query, setQuery, results, loading, error };
}
