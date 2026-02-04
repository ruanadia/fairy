import {
    Chapter,
    ChapterDetails,
    Tag,
    SourceManga,
    TagSection,
    PagedResults,
    PartialSourceManga
} from '@paperback/types'

export class KaganeParser {

    // --- Parsing des détails du Manga ---
    parseMangaDetails(json: any, mangaId: string): SourceManga {
        const data = json
        const tags: Tag[] = []
        
        if (data.metadata?.genres) {
            for (const genre of data.metadata.genres) {
                tags.push(App.createTag({ id: genre, label: genre }))
            }
        }

        return App.createSourceManga({
            id: mangaId,
            mangaInfo: App.createMangaInfo({
                titles: [data.name],
                image: `https://api.kagane.org/api/v1/series/${mangaId}/thumbnail`,
                status: data.status,
                author: data.authors ? data.authors.join(', ') : 'Unknown',
                desc: data.summary ?? 'No description available',
                tags: [App.createTagSection({ id: '0', label: 'genres', tags: tags })]
            })
        })
    }

    // --- Parsing de la liste des Chapitres ---
    parseChapterList(json: any, mangaId: string): Chapter[] {
        const chapters: Chapter[] = []
        const list = json.data || json 

        for (const book of list) {
            chapters.push(App.createChapter({
                id: book.id,
                name: book.name || `Chapter ${book.index}`,
                langCode: 'en',
                chapNum: book.index || 0,
                time: book.created ? new Date(book.created) : new Date()
            }))
        }
        return chapters
    }

    // --- Parsing des Images ---
    parseChapterDetails(json: any, mangaId: string, chapterId: string): ChapterDetails {
        const pages: string[] = []
        const token = json.token
        const imageHost = 'https://ayanami.kagane.org'
        const fileList = json.files || json.pages || []

        for (const file of fileList) {
            const fileId = typeof file === 'string' ? file : file.id
            const imageUrl = `${imageHost}/api/v1/books/${mangaId}/file/${chapterId}/${fileId}?token=${token}`
            pages.push(imageUrl)
        }

        return App.createChapterDetails({
            id: chapterId,
            mangaId: mangaId,
            pages: pages
        })
    }

    // --- Parsing des résultats de recherche / Accueil ---
    parseSearchResults(json: any): PagedResults {
        const results: PartialSourceManga[] = []
        const list = json.data || json

        for (const item of list) {
            results.push(App.createPartialSourceManga({
                mangaId: item.id,
                image: `https://api.kagane.org/api/v1/series/${item.id}/thumbnail`,
                title: item.name,
                subtitle: undefined
            }))
        }

        return App.createPagedResults({
            results: results
        })
    }
}