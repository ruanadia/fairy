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

const DOMAIN = 'https://fairyscans.com'

export const FairyScansInfo: SourceInfo = {
    version: '1.0.1',
    name: 'FairyScans',
    icon: 'icon.png',
    author: 'Toi',
    authorWebsite: 'https://github.com/ruanadia',
    description: 'Extension pour lire FairyScans sur Paperback',
    contentRating: ContentRating.MATURE,
    websiteBaseURL: DOMAIN
}

export class FairyScans extends Source {
    requestManager = App.createRequestManager({
        requestsPerSecond: 3,
        requestTimeout: 15000,
    })

    async getMangaDetails(mangaId: string): Promise<SourceManga> {
        const request = App.createRequest({
            url: `${DOMAIN}/manga/${mangaId}`,
            method: 'GET'
        })

        const response = await this.requestManager.schedule(request, 1)
        const $ = cheerio.load(response.data ?? '')

        // Sélecteurs spécifiques à MangaReader
        const title = $('.entry-title').text().trim()
        const image = $('.thumb img').attr('src') ?? ''
        const description = $('.entry-content p').text().trim()
        
        // Statut
        let status = 'Ongoing'
        const statusText = $('.imptdt:contains("Status") i').text().trim().toLowerCase()
        if (statusText.includes('completed')) status = 'Completed'

        return App.createSourceManga({
            id: mangaId,
            mangaInfo: App.createMangaInfo({
                titles: [title],
                image: image,
                status: status,
                desc: description,
            })
        })
    }

    async getChapters(mangaId: string): Promise<Chapter[]> {
        const request = App.createRequest({
            url: `${DOMAIN}/manga/${mangaId}`,
            method: 'GET'
        })

        const response = await this.requestManager.schedule(request, 1)
        const $ = cheerio.load(response.data ?? '')

        const chapters: Chapter[] = []
        // Sélecteur standard MangaReader pour les chapitres
        const chapterNodes = $('#chapterlist li')

        for (const node of chapterNodes) {
            const link = $(node).find('a') // Parfois 'div a', parfois juste 'a'
            const title = $(node).find('.chapternum').text().trim() || link.text().trim()
            const href = link.attr('href')
            
            // On extrait l'ID unique du chapitre depuis l'URL (ex: /chapter-100/)
            // Pour MangaReader, souvent l'URL complète suffit, mais prenons le dernier segment
            // L'ID doit être ce qui suit /manga/nom-du-manga/
            // Exemple href: https://fairyscans.com/manga/titre/chapitre-1/
            // On va utiliser l'URL complète relative comme ID pour être sûr
            const id = href ? href.replace(DOMAIN, '') : ''

            if (!id) continue

            // Extraction du numéro (ex: "Chapter 12" -> 12)
            const chapNum = Number(title.match(/(\d+(\.\d+)?)/)?.[0] ?? 0)
            const timeStr = $(node).find('.chapterdate').text().trim()
            const time = new Date(timeStr) // MangaReader met souvent des dates lisibles

            chapters.push(App.createChapter({
                id: id, // L'ID est l'URL relative (ex: /manga/titre/chapitre-1/)
                chapNum: chapNum,
                name: title,
                langCode: 'fr', // Ou 'en' selon le contenu
                time: isNaN(time.getTime()) ? new Date() : time
            }))
        }
        return chapters
    }

    async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        // chapterId contient déjà le chemin relatif (ex: /manga/titre/chapitre-1/)
        const request = App.createRequest({
            url: `${DOMAIN}${chapterId}`,
            method: 'GET'
        })

        const response = await this.requestManager.schedule(request, 1)
        const $ = cheerio.load(response.data ?? '')

        const pages: string[] = []
        // Sélecteur standard MangaReader pour les images
        const images = $('#readerarea img')

        for (const img of images) {
            let url = $(img).attr('src')?.trim()
            if (url) pages.push(url)
        }

        return App.createChapterDetails({
            id: chapterId,
            mangaId: mangaId,
            pages: pages
        })
    }

    async getSearchResults(query: SearchRequest, metadata: any): Promise<PagedResults> {
        const searchUrl = `${DOMAIN}/?s=${encodeURIComponent(query.title ?? '')}`
        
        const request = App.createRequest({
            url: searchUrl,
            method: 'GET'
        })

        const response = await this.requestManager.schedule(request, 1)
        const $ = cheerio.load(response.data ?? '')
        const tiles: any[] = []

        // Sélecteur MangaReader pour les listes (.bsx)
        const foundItems = $('.listupd .bsx')

        for (const item of foundItems) {
            const link = $(item).find('a')
            const title = link.attr('title') ?? $(item).find('.tt').text().trim()
            const image = $(item).find('img').attr('src') ?? ''
            const href = link.attr('href')
            // Extraction ID : /manga/nom-du-manga/
            const id = href?.split('/manga/')[1]?.replace(/\/$/, '')

            if (id && title) {
                tiles.push(App.createPartialSourceManga({
                    mangaId: id,
                    image: image,
                    title: title,
                    subtitle: undefined
                }))
            }
        }

        return App.createPagedResults({
            results: tiles
        })
    }

    async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {
        const section = App.createHomeSection({
            id: 'latest',
            title: 'Derniers Ajouts',
            containsMoreItems: true,
            type: 'singleRowNormal'
        })
        sectionCallback(section)

        // Sur MangaReader, la page d'accueil liste directement les nouveautés
        const request = App.createRequest({
            url: DOMAIN,
            method: 'GET'
        })

        const response = await this.requestManager.schedule(request, 1)
        const $ = cheerio.load(response.data ?? '')
        
        const mangaList: any[] = []
        // Le sélecteur .listupd .bsx est parfait pour la homepage aussi
        const items = $('.listupd .bsx')

        for (const item of items) {
            const link = $(item).find('a').first()
            const title = link.attr('title') ?? $(item).find('.tt').text().trim()
            const image = $(item).find('img').attr('src') ?? ''
            const href = link.attr('href')
            const id = href?.split('/manga/')[1]?.replace(/\/$/, '')

            if (id && title) {
                mangaList.push(App.createPartialSourceManga({
                    mangaId: id,
                    title: title,
                    image: image,
                    subtitle: undefined
                }))
            }
        }

        section.items = mangaList
        sectionCallback(section)
    }
}