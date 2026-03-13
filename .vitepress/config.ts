import { defineConfig } from 'vitepress'
import { getPosts } from './theme/serverUtils'

//每页的文章数量
const pageSize = 10

const isProd = process.env.NODE_ENV === 'production'

export default defineConfig({
    title: 'Vitepress blog',
    base: '/v-blog/',
    cacheDir: './node_modules/vitepress_cache',
    description: 'vitepress,blog,blog-theme',
    ignoreDeadLinks: true,
    themeConfig: {
        posts: await getPosts(pageSize),
        website: 'https://github.com/VvV1219/v-blog',
        // 评论的仓库地址 https://giscus.app/ 
        comment: {
            repo: 'VvV1219/v-blog',
            repoId: 'R_kgDORl29iw',
            categoryId: 'DIC_kwDORl29i84C4TCb'
        },
        nav: [
            { text: 'Home', link: '/' },
            { text: 'Category', link: '/pages/category' },
            { text: 'Tags', link: '/pages/tags' },
        ],
        search: {
            provider: 'local'
        },
        outline: {
            label: '文章摘要'
        },
        socialLinks: [{ icon: 'github', link: 'https://github.com/VvV1219/v-blog' }]
    } as any,

    srcExclude: isProd
        ? [
              '**/trash/**/*.md', // 排除所有 trash 目录
              '**/draft/**/*.md', // 递归排除子目录
              '**/private-notes/*.md', // 排除特定文件
              'README.md'
          ]
        : ['README.md'],
    vite: {
        //build: { minify: false }
        server: { port: 5000 }
    }
    /*
      optimizeDeps: {
          keepNames: true
      }
      */
})
