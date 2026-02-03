import {
    Source,
    SourceManga,   // CORRIGÉ: Manga -> SourceManga
    Chapter,
    ChapterDetails,
    HomeSection,
    SearchRequest,
    PagedResults,
    SourceInfo,
    ContentRating,
    Request,
    Response,
    // On retire MangaStatus et LanguageCode qui n'existent plus
} from '@paperback/types'
import * as cheerio from 'cheerio'

const DOMAIN = 'https://fairyscans.com'

export const FairyScansInfo: SourceInfo = {
    version: '1.0.0',
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

    // CORRIGÉ: Le type de retour est Promise<SourceManga>
    async getMangaDetails(mangaId: string): Promise<SourceManga> {
        const request = App.createRequest({
            url: `${DOMAIN}/manga/${mangaId}`,
            method: 'GET'
        })

        const response = await this.requestManager.schedule(request, 1)
        
        // CORRIGÉ: On ajoute "?? ''" pour garantir que ce n'est pas undefined
        const $ = cheerio.load(response.data ?? '')

        const title = $('.post-title h1').first().text().trim()
        // Astuce: On prend data-src si dispo (lazy load), sinon src
        const imgTag = $('.summary_image img').first()
        const image = imgTag.attr('data-src') ?? imgTag.attr('src') ?? ''
        
        const description = $('.summary__content').text().trim()
        
        // CORRIGÉ: Plus de MangaStatus. On utilise des strings simples.
        let status = 'Ongoing'
        const statusText = $('.post-status .summary-content').text().trim().toLowerCase()
        if (statusText.includes('completed') || statusText.includes('terminé') || statusText.includes('end')) {
            status = 'Completed'
        }

        return App.createSourceManga({
            id: mangaId,
            mangaInfo: App.createMangaInfo({
                titles: [title],
                image: image,
                status: status, // On passe la string 'Ongoing' ou 'Completed'
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
        // CORRIGÉ: Securité sur les données
        const $ = cheerio.load(response.data ?? '')

        const chapters: Chapter[] = []
        const chapterNodes = $('.wp-manga-chapter')

        for (const node of chapterNodes) {
            const link = $(node).find('a')
            const title = link.text().trim()
            // Récupération ID sécurisée
            const href = link.attr('href')
            const id = href?.split('/').filter(x => x).pop() 
            
            if (!id) continue

            const chapNum = Number(title.match(/(\d+(\.\d+)?)/)?.[0] ?? 0)

            chapters.push(App.createChapter({
                id: id,
                chapNum: chapNum,
                name: title,
                // CORRIGÉ: LanguageCode.FRENCH -> 'fr' (ou 'en' si le site est en anglais)
                langCode: 'fr', 
                time: new Date() 
            }))
        }
        
        return chapters
    }

    async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        const request = App.createRequest({
            url: `${DOMAIN}/manga/${mangaId}/${chapterId}`,
            method: 'GET'
        })

        const response = await this.requestManager.schedule(request, 1)
        // CORRIGÉ
        const $ = cheerio.load(response.data ?? '')

        const pages: string[] = []
        const images = $('.reading-content img')

        for (const img of images) {
            // On gère les blancs autour des liens avec trim()
            let url = $(img).attr('data-src')?.trim() ?? $(img).attr('src')?.trim()
            if (url) {
                pages.push(url)
            }
        }

        return App.createChapterDetails({
            id: chapterId,
            mangaId: mangaId,
            pages: pages
        })
    }

    async getSearchResults(query: SearchRequest, metadata: any): Promise<PagedResults> {
        // On construit l'URL de recherche standard pour les sites Madara (comme FairyScans)
        // Format: domain/?s=recherche&post_type=wp-manga
        const searchUrl = `${DOMAIN}/?s=${encodeURIComponent(query.title ?? '')}&post_type=wp-manga`
        
        const request = App.createRequest({
            url: searchUrl,
            method: 'GET'
        })

        const response = await this.requestManager.schedule(request, 1)
        
        // Sécurité si la requête échoue
        const $ = cheerio.load(response.data ?? '')
        const tiles: any[] = []

        // On cherche les blocs de résultats. 
        // Sur Madara, c'est souvent ".c-tabs-item__content"
        const foundItems = $('.c-tabs-item__content')

        for (const item of foundItems) {
            const titleElement = $(item).find('.post-title h3 a')
            const title = titleElement.text().trim()
            const image = $(item).find('img').attr('src') ?? ''
            const href = titleElement.attr('href')
            // On extrait l'ID de l'URL
            const id = href?.split('/').filter(x => x).pop()

            if (id && title) {
                tiles.push(App.createPartialSourceManga({
                    mangaId: id,
                    image: image,
                    title: title,
                    subtitle: undefined
                }))
            }
        }

        // On renvoie les résultats formatés
        return App.createPagedResults({
            results: tiles
        })
    }
}