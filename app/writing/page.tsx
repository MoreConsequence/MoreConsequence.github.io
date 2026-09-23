import type { Metadata } from "next";
import { WritingArchive } from "@/components/post/writing-archive";
import { getAllPosts } from "@/lib/content/posts";

export const metadata: Metadata = {
  title: "全部文章",
  description: "按技术领域与时间归档浏览全部技术长文。",
};

export default async function WritingPage() {
  const posts = await getAllPosts();

  return (
    <div className="archive-page">
      <header className="page-intro">
        <p className="eyebrow">Archive / {posts.length} essays across 5 pillars</p>
        <h1>全部文章</h1>
        <p>
          关于软件系统、架构设计与底层工程的深度记录。支持按五大核心技术支柱即时筛选。
        </p>
      </header>
      <WritingArchive posts={posts} />
    </div>
  );
}
