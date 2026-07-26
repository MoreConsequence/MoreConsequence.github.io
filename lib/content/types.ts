export type PostMeta = {
  title: string;
  description: string;
  publishedAt: string;
  updatedAt?: string;
  tags: string[];
  draft: boolean;
  featured: boolean;
  series?: string;
};

export type PostSource = {
  slug: string;
  meta: PostMeta;
  body: string;
};

export type TocItem = {
  id: string;
  title: string;
  depth: number;
};

export type CompiledPost = PostSource & {
  html: string;
  toc: TocItem[];
  readingTimeMinutes: number;
  plainText: string;
};
