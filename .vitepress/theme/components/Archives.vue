<template>
    <a
        :href="withBase(article.regularPath)"
        v-for="(article, index) in articles"
        :key="index"
        class="posts"
    >
        <div class="post-container">
            <div class="post-dot"></div>
            {{ article.frontMatter.title }}
        </div>
    </a>
</template>

<script lang="ts" setup>
import { useData, withBase } from 'vitepress'
import { computed } from 'vue'

const { theme } = useData()
const articles = computed(() => theme.value.posts)
</script>
