import { defineCollection, z } from 'astro:content';
import { glob, file } from 'astro/loaders';

/**
 * 实习 / 项目经历
 * 目录结构示例：src/content/project/teacher/teacher.md（图片放在同一文件夹里）
 */
const project = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/project' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      subtitle: z.string().optional(),
      year: z.string(),
      role: z.string(),
      summary: z.string(),
      cover: image(),
      coverAlt: z.string().optional(),
      /** 可选：卡片悬停时播放的短视频（直接放在 public/ 下，如 /xx.mp4） */
      video: z.string().optional(),
      tags: z.array(z.string()).default([]),
      order: z.number().default(0),
      link: z.string().optional(),
      linkLabel: z.string().optional(),
    }),
});

/**
 * 随想：带封面图的 .md 对象
 * 目录结构示例：src/content/post/future thought/index.md + cover.jpg
 * frame: stamp | deckle | hairline
 */
const post = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/post' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      date: z.coerce.date(),
      excerpt: z.string().optional(),
      cover: image(),
      coverAlt: z.string().optional(),
      /** 图片边幅：stamp 切割邮票边 / deckle 手撕毛边 / hairline 画廊白边 */
      frame: z.enum(['stamp', 'deckle', 'hairline']).default('hairline'),
      tags: z.array(z.string()).default([]),
      order: z.number().default(0),
    }),
});

/**
 * 生活图片 + photometa.json 元信息
 */
const picture = defineCollection({
  loader: file('./src/content/picture/photometa.json'),
  schema: z.object({
    id: z.string(),
    image: z.string(),
    video: z.string().optional(),
    type: z.enum(['photo', 'live', 'video']).default('photo'),
    caption: z.string().default(''),
    alt: z.string().default(''),
    taken: z.string().default(''),
    order: z.number().default(0),
    /** 导出图片的元信息（宽、高、宽高比），由 photometa.json 记录 */
    width: z.number().optional(),
    height: z.number().optional(),
    ratio: z.number().optional(),
  }),
});

export const collections = { project, post, picture };