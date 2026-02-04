"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Kagane = exports.KaganeInfo = void 0;
const types_1 = require("@paperback/types");
const API_URL = 'https://api.kagane.org/api/v1';
const DOMAIN = 'https://kagane.org';
const COMMON_HEADERS = {
    'Referer': `${DOMAIN}/`,
    'Origin': DOMAIN,
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1'
};
exports.KaganeInfo = {
    version: '1.2.5', // ⬆️ Nouvelle version
    name: 'Kagane',
    icon: 'icon.png',
    author: 'Toi',
    authorWebsite: 'https://github.com/ruanadia',
    description: 'Extension Scrapper Brut pour Kagane.org',
    contentRating: types_1.ContentRating.MATURE,
    websiteBaseURL: DOMAIN
};
class Kagane extends types_1.Source {
    constructor() {
        super(...arguments);
        this.requestManager = App.createRequestManager({
            requestsPerSecond: 3,
            requestTimeout: 15000,
        });
    }
    // --- SCANNER BRUT (La solution ultime) ---
    // Cette fonction cherche des objets JSON directement dans le texte de la page
    extractMangaFromText(text) {
        const items = [];
        const uniqueIds = new Set();
        // 1. On cherche des motifs JSON : {"id":"...","title":"...","thumbnail":"..."}
        // Le regex cherche un ID suivi (plus loin) d'un titre, ou l'inverse
        // C'est un peu "sale" mais ça marche sur les Next.js cryptés
        // Regex pour capturer des objets ressemblant à des mangas
        // On cherche des blocs qui contiennent "id":"..." et "thumbnail":"..."
        const regexGlobal = /{[^{}]*"id"\s*:\s*"(.*?)"[^{}]*"title"\s*:\s*"(.*?)"[^{}]*"thumbnail"\s*:\s*"(.*?)"/g;
        // On nettoie un peu le texte des backslashes qui polluent le JSON inliné
        const cleanText = text.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
        let match;
        while ((match = regexGlobal.exec(cleanText)) !== null) {
            const id = match[1];
            const title = match[2];
            const thumb = match[3];
            if (id && title && !uniqueIds.has(id)) {
                uniqueIds.add(id);
                items.push({ id, title, thumbnail: thumb });
            }
        }
        // Si la méthode précise échoue, on tente une extraction plus large via Cheerio sur les scripts
        if (items.length === 0) {
            // On cherche tout ce qui ressemble à un ID UUID (ex: 37CI...)
            const uuidRegex = /"id":"([A-Za-z0-9]{20,})"/g;
            while ((match = uuidRegex.exec(cleanText)) !== null) {
                // Pour chaque ID trouvé, on essaie de trouver le titre juste après
                const id = match[1];
                if (uniqueIds.has(id))
                    continue;
                // On extrait un petit bout de texte autour de l'ID pour trouver le reste
                const sub = cleanText.substring(match.index, match.index + 500);
                const titleMatch = sub.match(/"(title|name)"\s*:\s*"(.*?)"/);
                const imgMatch = sub.match(/"(thumbnail|cover|image)"\s*:\s*"(.*?)"/);
                if (titleMatch && imgMatch) {
                    uniqueIds.add(id);
                    items.push({ id, title: titleMatch[2], thumbnail: imgMatch[2] });
                }
            }
        }
        return items;
    }
    async getHomePageSections(sectionCallback) {
        var _a;
        // Une seule section pour tester
        const section = App.createHomeSection({
            id: 'popular',
            title: 'Popular Manga',
            containsMoreItems: true,
            type: 'singleRowNormal'
        });
        sectionCallback(section);
        // On appelle directement la page de recherche qui contient le plus de données
        const request = App.createRequest({
            url: `${DOMAIN}/search?sort=views,desc`,
            method: 'GET',
            headers: COMMON_HEADERS
        });
        try {
            const response = await this.requestManager.schedule(request, 1);
            const html = (_a = response.data) !== null && _a !== void 0 ? _a : '';
            // On utilise notre scanner brut
            const items = this.extractMangaFromText(html);
            const mangaList = [];
            for (const item of items) {
                let image = item.thumbnail || '';
                if (image && !image.startsWith('http')) {
                    image = `${DOMAIN}/_next/image?url=${encodeURIComponent(image)}&w=384&q=75`;
                }
                // Sécurité image
                if (!image)
                    image = 'https://kagane.org/favicon.ico';
                mangaList.push(App.createPartialSourceManga({
                    mangaId: item.id,
                    title: item.title,
                    image: image,
                    subtitle: undefined
                }));
            }
            section.items = mangaList;
            sectionCallback(section);
        }
        catch (e) {
            console.log(`Erreur Home: ${e}`);
            sectionCallback(section);
        }
    }
    async getMangaDetails(mangaId) {
        var _a;
        // Pour les détails, on passe par l'API car c'est plus stable pour un item précis
        // Si l'API échoue, on pourrait parser le HTML, mais testons l'API d'abord
        const request = App.createRequest({
            url: `${API_URL}/series/${mangaId}`,
            method: 'GET',
            headers: COMMON_HEADERS
        });
        const response = await this.requestManager.schedule(request, 1);
        const json = JSON.parse((_a = response.data) !== null && _a !== void 0 ? _a : '{}');
        const data = json.data || json;
        let image = data.thumbnail || '';
        if (image && !image.startsWith('http')) {
            image = `${DOMAIN}/_next/image?url=${encodeURIComponent(image)}&w=384&q=75`;
        }
        return App.createSourceManga({
            id: mangaId,
            mangaInfo: App.createMangaInfo({
                titles: [data.title || data.name || 'Unknown'],
                image: image,
                status: 'Ongoing',
                desc: data.summary || data.description || '',
                artist: data.authors ? data.authors.join(', ') : '',
                tags: []
            })
        });
    }
    async getChapters(mangaId) {
        var _a, _b;
        const request = App.createRequest({
            url: `${API_URL}/series/${mangaId}`,
            method: 'GET',
            headers: COMMON_HEADERS
        });
        const response = await this.requestManager.schedule(request, 1);
        const json = JSON.parse((_a = response.data) !== null && _a !== void 0 ? _a : '{}');
        const chapters = [];
        const list = json.books || json.chapters || ((_b = json.data) === null || _b === void 0 ? void 0 : _b.books) || [];
        for (const item of list) {
            chapters.push(App.createChapter({
                id: String(item.id),
                chapNum: Number(item.chapterNumber || item.number || 0),
                name: item.title || `Chapter ${item.number}`,
                langCode: 'en',
                time: new Date()
            }));
        }
        return chapters;
    }
    async getChapterDetails(mangaId, chapterId) {
        var _a;
        const request = App.createRequest({
            url: `${API_URL}/books/${mangaId}/file/${chapterId}`,
            method: 'GET',
            headers: COMMON_HEADERS
        });
        const response = await this.requestManager.schedule(request, 1);
        const json = JSON.parse((_a = response.data) !== null && _a !== void 0 ? _a : '{}');
        let pages = [];
        const list = Array.isArray(json) ? json : (json.images || json.data || []);
        pages = list.map((x) => typeof x === 'string' ? x : x.url);
        return App.createChapterDetails({
            id: chapterId,
            mangaId: mangaId,
            pages: pages
        });
    }
    async getSearchResults(query, metadata) {
        var _a, _b;
        // Recherche : On tente le scan HTML aussi car l'API semble bloquée
        const request = App.createRequest({
            url: `${DOMAIN}/search?q=${encodeURIComponent((_a = query.title) !== null && _a !== void 0 ? _a : '')}`,
            method: 'GET',
            headers: COMMON_HEADERS
        });
        const response = await this.requestManager.schedule(request, 1);
        const items = this.extractMangaFromText((_b = response.data) !== null && _b !== void 0 ? _b : '');
        const tiles = [];
        for (const item of items) {
            let image = item.thumbnail || '';
            if (image && !image.startsWith('http'))
                image = `${DOMAIN}/_next/image?url=${encodeURIComponent(image)}&w=384&q=75`;
            tiles.push(App.createPartialSourceManga({
                mangaId: item.id,
                title: item.title,
                image: image,
                subtitle: undefined
            }));
        }
        return App.createPagedResults({ results: tiles });
    }
}
exports.Kagane = Kagane;
