/**
 * ————————————————————————————————————————————————
 *  funiki · siteconfig
 *  这里是整站唯一的「自定义中心」：头像、链接、座右铭、
 *  首屏比例、动画节奏……改这里就够了。
 * ————————————————————————————————————————————————
 */

export const siteConfig = {
  /* ---------------------------------- 站点 ---------------------------------- */
  site: {
    title: 'Funiki',
    titleZh: '浮尼记',
    description: '独立设计师与前端开发者。做品牌、做产品，也做自己觉得有趣的小东西。',
    lang: 'zh-CN',
    url: 'https://zes-z.github.io/funiki/',
    themeColor: '#ffffff',
  },

  /* ---------------------------------- 身份 ---------------------------------- */
  identity: {
    name: 'Funiki',
    nameZh: '浮尼奇',
    /** 基础信息行的年龄 */
    age: 24,
    /** 地址旁的网页链接 */
    website: { label: 'funiki.design', url: 'https://zes-z.github.io/funiki/' },
    role: '独立设计师 & 前端开发者',
    bio: '做品牌、做产品，也做自己觉得有趣的小东西。相信好的设计是克制的，好的代码也是。',
    location: '杭州，中国',
    timezone: 'Asia/Shanghai',
    /** 头像：放在 public/ 下，建议 800×800 以上正方形 */
    avatar: '/avatar.webp',
    /** 头像的替代文字（给读屏 / SEO 用，不是图片地址） */
    avatarAlt: 'Funiki 的黑白头像',
    /** 简历：放在 public/ 下，文件名可含空格 */
    resume: '/kim cv.pdf',
    resumeLabel: '下载简历',
    resumeMeta: 'PDF · 110 KB',
    email: 'hello@funiki.design',
  },

  /* -------------------------------- 首屏（第一幅） -------------------------------- */
  hero: {
    /** 上半部分图像区占首屏高度的比例（0–1），下半部分自动补齐 */
    imageAreaRatio: 0.56,
    /** 首屏上半区的大图（放在 public/ 下，替换成你自己的图片即可） */
    coverImage: '/hero.jpg',
    /** 首屏大图的替代文字（给读屏 / SEO 用，不是图片地址） */
    coverAlt: '云海之上的雪山与日出',
    /** 头像直径的 clamp 值（位于上下两块之间的分界线上） */
    avatarSize: 'clamp(104px, 13vh, 140px)',
    /** 头像形状：'circle' | 'rounded' | 'arch' */
    avatarShape: 'circle',
    /** 座右铭每句展示时长后开始删除（毫秒） */
    motto: {
      lines: [
        '把好奇心做成日常。',
        '在代码与画面之间随机漫步。',
        '随心所欲，不逾矩。',
      ],
      /** 逐字打出的速度（毫秒/字） */
      typeSpeed: 90,
      /** 逐字删除的速度（毫秒/字） */
      deleteSpeed: 30,
      /** 整句展示时长（毫秒） */
      hold: 3000,
      /** 删除后切换到下一句的停顿（毫秒） */
      gap: 1000,
    },
    scrollHint: '向下滚动',
  },

  /* -------------------------------- 社交链接 -------------------------------- */
  /** 社交图标（首屏 / 左上角菜单 / 页脚共用）；icon: 'mailcolor' 会自动用邮箱地址 */
  socials: [
    { label: 'GitHub', icon: 'github', url: 'https://github.com/funiki' },
    { label: '邮件', icon: 'mailcolor', url: 'mailto' },
    { label: '小红书', icon: 'xiaohongshu', url: 'https://www.xiaohongshu.com/user/profile/funiki' },
    { label: 'Bilibili', icon: 'bilibili', url: 'https://space.bilibili.com/3490000000000000' },
  ],

  /* ------------------------------ 左上角头像 & 菜单 ------------------------------ */
  dock: {
    /** 头像停靠后的直径（px） */
    size: 56,
    /** 距离视口左上角的距离（px） */
    offset: { x: 26, y: 24 },
    /** 弹出菜单的动效时长（秒） */
    openDuration: 0.44,
    closeDuration: 0.26,
  },

  /* --------------------------------- 各幅文案 --------------------------------- */
  sections: {
    work: {
      index: '01',
      label: 'Experience & Projects',
      title: '实习与项目',
      intro: '一些正在做、做过、和还没做完的事。左右拖动看看，点开读全文。',
      hint: '拖动 / 滚动查看更多',
      railLabel: '项目列表',
    },
    life: {
      index: '02',
      label: 'Life in Frames',
      title: '生活切片',
      intro: '相机快门按下的那些瞬间，偶尔还有几秒实况。',
      hint: '点开任意一张查看大图',
      wallLabel: '生活图片',
    },
    thoughts: {
      index: '03',
      label: 'Random Thoughts',
      title: '随想',
      intro: '一些没头没尾的念头，被装进不同的相框里。',
      hint: '自动平移 · 悬停暂停 · 左右拖动 · 点开阅读全文',
    },
    beyond: {
      label: 'Beyond Work',
      title: '个人扩展',
      intro: '工作之外，构成我的那些东西。',
    },
    tail: {
      ctaTitle: '不如聊一聊',
      ctaText: '如果你也喜欢把东西做得慢一点、好一点，欢迎写信给我。',
      footerLine: '目前接受品牌与产品设计委托，也乐意做点没头没尾的小实验。',
      ctaEmailLabel: '写封邮件',
      backToTop: '回到顶部',
      copyright: '© 2026 Funiki. Built with Astro, GSAP & a lot of coffee.',
    },
  },

  /* -------------------------------- 尾幅扩展区 -------------------------------- */
  /* ------------------------------ 生活图片区（第三幅） ------------------------------ */
  life: {
    /** 桌面端列数；移动端自动 1–2 列 */
    columns: 3,
    /** 图片之间的间距（px） */
    gap: 18,
    /** 滚动进入时的上浮距离（px） */
    revealY: 42,
  },

  /* ------------------------------ 随想区（第四幅） ------------------------------ */
  thoughts: {
    /** 横向列表完整循环一圈的时长（秒），越大越慢 */
    marqueeDuration: 52,
    /** 每个相框的宽度 */
    itemWidth: 'clamp(220px, 22vw, 320px)',
    /** 相框的固定高度 */
    stripHeight: 'clamp(290px, 29vw, 370px)',
  },

  /* --------------------------------- 动效参数 --------------------------------- */
  motion: {
    /** 是否启用平滑滚动 */
    smoothScroll: true,
    /** 平滑滚动的阻尼（越小越顺滑） */
    smoothScrollLerp: 0.1,
    /** 全局缓动 */
    ease: 'power3.out',
    /** 滚动显现的默认时长（秒） */
    revealDuration: 0.9,
    /** 滚动显现的错峰间隔（秒） */
    revealStagger: 0.07,
    /** 是否显示自定义光标（关闭时使用系统原生光标，更稳定） */
    customCursor: false,
  },
} as const;

export type SiteConfig = typeof siteConfig;
export default siteConfig;