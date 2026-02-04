import {
    Source,
    SourceManga,
    Chapter,
    ChapterDetails,
    HomeSection,
    SearchRequest,
    PagedResults,
    SourceInfo,
    ContentRating,
    Request,
    Response,
} from '@paperback/types'
import * as cheerio from 'cheerio'

const DOMAIN = 'https://kagane.org'
const API_URL = 'https://api.kagane.org/api/v1'

const COMMON_HEADERS = {
    'Referer': DOMAIN,
    'Origin': DOMAIN,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

export const KaganeInfo: SourceInfo = {
    version: '1.0.6', // J'augmente la version pour forcer la mise à jour
    name: 'Kagane',
    icon: 'icon.png',
    author: 'Toi',
    authorWebsite: 'https://github.com/ruanadia',
    description: 'Extension pour Kagane.org',
    contentRating: ContentRating.MATURE,
    websiteBaseURL: DOMAIN
}

export class Kagane extends Source {
    requestManager = App.createRequestManager({
        requestsPerSecond: 3,
        requestTimeout: 15000,
    })

    // --- Couteau Suisse pour décoder les données du site ---
    parseMangaListFromHTML(html: string): any[] {
        const $ = cheerio.load(html)
        const items: any[] = []

        // 1. On essaie de lire les liens visibles (Le plus fiable)
        $('a[href^="/series/"]').each((i, el) => {
            const href = $(el).attr('href')
            const id = href?.split('/').pop()
            
            // On cherche le titre dans les balises enfants courantes
            const title = $(el).find('h3, h4, span.font-bold, .title').first().text().trim() || $(el).attr('title')
            
            // On cherche l'image
            let image = $(el).find('img').attr('src') || $(el).find('img').attr('srcset')?.split(' ')[0]
            
            // Nettoyage de l'image
            if (image) {
                if (image.startsWith('/_next')) image = DOMAIN + image
                // Si l'image est encodée (url=...)
                if (image.includes('url=')) {
                    const match = image.match(/url=(.*?)&/)
                    if (match) image = decodeURIComponent(match[1])
                }
            }

            if (id && title) {
                // On évite les doublons
                if (!items.find(x => x.id === id)) {
                    items.push({ id, title, image })
                }
            }
        })

        return items
    }

    async getMangaDetails(mangaId: string): Promise<SourceManga> {
        // On lit la page web de la série
        const request = App.createRequest({
            url: `${DOMAIN}/series/${mangaId}`,
            method: 'GET',
            headers: COMMON_HEADERS
        })

        const response = await this.requestManager.schedule(request, 1)
        const html = response.data ?? ''
        const $ = cheerio.load(html)

        // Extraction des infos
        const title = $('h1').first().text().trim() || 'Titre Inconnu'
        const desc = $('p.description, .summary, div[class*="description"]').text().trim()
        
        // Image : on cherche la plus pertinente
        let image = $('img[alt*="cover"], img[alt="' + title + '"]').attr('src') || ''
        if (image.startsWith('/')) image = DOMAIN + image

        let status = 'Ongoing'
        if (html.includes('"status":"COMPLETED"') || $('*:contains("Status: Completed")').length > 0) {
            status = 'Completed'
        }

        return App.createSourceManga({
            id: mangaId,
            mangaInfo: App.createMangaInfo({
                titles: [title],
                image: image,
                status: status,
                desc: desc,
            })
        })
    }

    async getChapters(mangaId: string): Promise<Chapter[]> {
        // On demande à l'API interne la liste des chapitres
        // C'est souvent plus fiable que le HTML pour une longue liste
        const request = App.createRequest({
            url: `${API_URL}/series/${mangaId}`, // L'API v1 renvoie souvent tout ici
            method: 'GET',
            headers: COMMON_HEADERS
        })

        const response = await this.requestManager.schedule(request, 1)
        const chapters: Chapter[] = []
        
        try {
            const json = JSON.parse(response.data ?? '{}')
            // Les chapitres peuvent être dans 'books', 'chapters' ou 'data.books'
            const list = json.books || json.chapters || json.data?.books || []

            for (const item of list) {
                chapters.push(App.createChapter({
                    id: String(item.id),
                    chapNum: Number(item.chapterNumber || item.number || item.sequenceNumber || 0),
                    name: item.title || item.name || `Chapter ${item.number}`,
                    langCode: 'en',
                    time: item.createdAt ? new Date(item.createdAt) : new Date()
                }))
            }
        } catch (e) {
            console.log('Erreur parsing chapitres')
        }
        return chapters
    }

    async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        // C'est l'URL secrète que tu as trouvée !
        const request = App.createRequest({
            url: `${API_URL}/books/${mangaId}/file/${chapterId}`,
            method: 'GET',
            headers: COMMON_HEADERS
        })

        const response = await this.requestManager.schedule(request, 1)
        let pages: string[] = []

        try {
            // L'API renvoie une liste directe d'URLs ou un objet
            const json = JSON.parse(response.data ?? '[]')
            const list = Array.isArray(json) ? json : (json.images || json.data || [])
            
            pages = list.map((img: any) => {
                // Si c'est un objet {url: '...'} ou juste une string
                return typeof img === 'string' ? img : img.url
            })
        } catch (e) {
            throw new Error(`Erreur chargement images`)
        }

        return App.createChapterDetails({
            id: chapterId,
            mangaId: mangaId,
            pages: pages
        })
    }

    async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {
        const section = App.createHomeSection({ id: 'latest', title: 'Latest Updates', containsMoreItems: true, type: 'singleRowNormal' })
        sectionCallback(section)

        // On interroge la page de recherche du site (C'est ce qui marche le mieux)
        const request = App.createRequest({
            url: `${DOMAIN}/search?sort=created_at,desc`,
            method: 'GET',
            headers: COMMON_HEADERS
        })

        const response = await this.requestManager.schedule(request, 1)
        const items = this.parseMangaListFromHTML(response.data ?? '')
        
        const mangaList: any[] = []
        for (const item of items) {
            mangaList.push(App.createPartialSourceManga({
                mangaId: item.id,
                title: item.title,
                image: item.image,
                subtitle: undefined
            }))
        }

        section.items = mangaList
        sectionCallback(section)
    }

    async getSearchResults(query: SearchRequest, metadata: any): Promise<PagedResults> {
        const request = App.createRequest({
            url: `${DOMAIN}/search?q=${encodeURIComponent(query.title ?? '')}`,
            method: 'GET',
            headers: COMMON_HEADERS
        })

        const response = await this.requestManager.schedule(request, 1)
        const items = this.parseMangaListFromHTML(response.data ?? '')
        
        const tiles: any[] = []
        for (const item of items) {
            tiles.push(App.createPartialSourceManga({
                mangaId: item.id,
                title: item.title,
                image: item.image,
                subtitle: undefined
            }))
        }

        return App.createPagedResults({ results: tiles })
    }
}