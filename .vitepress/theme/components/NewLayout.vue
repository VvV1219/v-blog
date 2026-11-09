<template>
    <Layout>
        <template #doc-before>
            <div style="padding-top: 20px" class="post-info" v-if="!$frontmatter.page">
                <span v-for="item in $frontmatter.tags"
                    ><a :href="withBase(`/pages/tags.html?tag=${item}`)"> {{ item }}</a></span
                >
            </div>
        </template>
        <template #doc-bottom>
            <Comment />
        </template>
    </Layout>
</template>
<script setup>
import DefaultTheme from 'vitepress/theme'
import { withBase } from 'vitepress'
const { Layout } = DefaultTheme
</script>
