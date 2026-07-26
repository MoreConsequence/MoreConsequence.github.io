import type { Metadata } from "next";
import { PostList } from "@/components/post/post-list";
import { getAllPosts } from "@/lib/content/posts";

export const metadata: Metadata = {
  title: "全部文章",
  description: "按时间浏览所有技术文章。",
};

export default async function WritingPage() {
  const posts = await getAllPosts();

  return (
    <div className="archive-page">
      <header className="page-intro">
        <p className="eyebrow">Archive / {posts.length} essays</p>
        <h1>全部文章</h1>
        <p>
          关于软件、系统与工程判断的持续记录。按时间归档，所有内容都来自普通的
          Markdown 文件。
        </p>
      </header>
      <PostList posts={posts} />
    </div>
  );
}
