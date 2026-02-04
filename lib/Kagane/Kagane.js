"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Kagane = exports.KaganeInfo = void 0;
const types_1 = require("@paperback/types");
// --- CONFIGURATION ---
const DOMAIN = "https://kagane.org";
const API_BASE = "https://api.kagane.org/api/v1";
// --- INFO EXTENSION ---
exports.KaganeInfo = {
    version: "1.3.1", // ⬆️ Nouvelle version adaptée à tes logs
    name: "Kagane",
    icon: "icon.png",
    author: "Toi",
    authorWebsite: "https://github.com/ruanadia",
    description: "Extension Kagane (Mode Next.js RSC)",
    contentRating: types_1.ContentRating.MATURE,
    websiteBaseURL: DOMAIN,
    intents: types_1.SourceIntents.MANGA_CHAPTERS | types_1.SourceIntents.HOMEPAGE_SECTIONS,
};
// --- CLASSE PRINCIPALE ---
class Kagane extends types_1.Source {
    constructor() {
        super(...arguments);
        this.stateManager = App.createSourceStateManager();
        this.requestManager = App.createRequestManager({
            requestsPerSecond: 4,
            requestTimeout: 15000,
            interceptor: {
                interceptRequest: async (request) => {
                    var _a;
                    request.headers = {
                        ...((_a = request.headers) !== null && _a !== void 0 ? _a : {}),
                        Referer: `${DOMAIN}/`,
                        Origin: DOMAIN,
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                        "Next-Router-State-Tree": "%5B%22%22%2C%7B%22children%22%3A%5B%22search%22%2C%7B%22children%22%3A%5B%22__PAGE__%22%2C%7B%7D%5D%7D%5D%7D%2Cnull%2Cnull%2Ctrue%5D",
                        "Next-Url": "/search",
                        "RSC": "1"
                    };
                    return request;
                },
                interceptResponse: async (response) => {
                    return response;
                },
            },
        });
    }
    // --- SCANNER DE TEXTE (LE COEUR DU SYSTÈME) ---
    // C'est lui qui va lire le charabia du site pour trouver tes mangas
    parseRawData(text) {
        const items = [];
        const uniqueIds = new Set();
        // On nettoie le texte pour faciliter la lecture
        const cleanText = text.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
        // 1. On cherche les IDs (format alphanumérique long que tu as vu dans les logs)
        // Ex: 3KAYG0X6JPF7FX5XXB4P8YGSS5
        const idRegex = /"id":"([A-Z0-9]{20,})"/g;
        let match;
        while ((match = idRegex.exec(cleanText)) !== null) {
            const id = match[1];
            if (uniqueIds.has(id))
                continue;
            // On regarde autour de l'ID pour trouver le titre (dans les 1000 caractères suivants)
            const chunk = cleanText.substring(match.index, match.index + 1000);
            // On cherche un titre proche
            const titleMatch = chunk.match(/"(title|name)"\s*:\s*"(.*?)"/);
            if (titleMatch) {
                uniqueIds.add(id);
                // On reconstruit l'image avec l'URL que tu as trouvée dans tes logs !
                const thumbnail = `${API_BASE}/series/${id}/thumbnail`;
                items.push({
                    id: id,
                    title: titleMatch[2],
                    image: thumbnail
                });
            }
        }
        return items;
    }
    // --- ACCUEIL ---
    async getHomePageSections(sectionCallback) {
        var _a;
        const section = App.createHomeSection({
            id: "popular",
            title: "Popular & Latest",
            containsMoreItems: true,
            type: types_1.HomeSectionType.singleRowNormal,
        });
        sectionCallback(section);
        // On appelle la page SEARCH car c'est elle qui contient la liste (cf tes logs)
        // On ajoute le paramètre magique _rsc pour avoir les données brutes
        const request = App.createRequest({
            url: `${DOMAIN}/search?_rsc=3lb4g`,
            method: "GET",
        });
        try {
            const response = await this.requestManager.schedule(request, 1);
            // On scanne le texte reçu
            const items = this.parseRawData((_a = response.data) !== null && _a !== void 0 ? _a : "");
            const mangaList = [];
            for (const item of items) {
                mangaList.push(App.createPartialSourceManga({
                    mangaId: item.id,
                    image: item.image,
                    title: item.title,
                    subtitle: undefined,
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
    // --- VIEW MORE ---
    async getViewMoreItems(homepageSectionId, metadata) {
        // Pour l'instant, on renvoie la même chose car la pagination RSC est complexe
        // On pourra l'améliorer plus tard si la base fonctionne
        return App.createPagedResults({ results: [] });
    }
    // --- DETAILS ---
    async getMangaDetails(mangaId) {
        var _a;
        // Là on peut utiliser l'API car elle marche pour UN manga précis
        const request = App.createRequest({
            url: `${API_BASE}/series/${mangaId}`,
            method: "GET",
        });
        const response = await this.requestManager.schedule(request, 1);
        const json = JSON.parse((_a = response.data) !== null && _a !== void 0 ? _a : "{}");
        const data = json.data || json;
        return App.createSourceManga({
            id: mangaId,
            mangaInfo: App.createMangaInfo({
                titles: [data.title || data.name || "Unknown"],
                image: `${API_BASE}/series/${mangaId}/thumbnail`, // On utilise ton lien sûr
                status: "Ongoing",
                desc: data.summary || data.description || "No description",
                author: data.authors ? data.authors.join(", ") : "",
            }),
        });
    }
    // --- CHAPITRES ---
    async getChapters(mangaId) {
        var _a;
        const request = App.createRequest({
            url: `${API_BASE}/series/${mangaId}`,
            method: "GET",
        });
        const response = await this.requestManager.schedule(request, 1);
        const json = JSON.parse((_a = response.data) !== null && _a !== void 0 ? _a : "{}");
        const data = json.data || json;
        const rawChapters = data.books || data.chapters || [];
        const chapters = [];
        for (const chap of rawChapters) {
            chapters.push(App.createChapter({
                id: String(chap.id),
                chapNum: Number(chap.chapterNumber || chap.number || 0),
                name: chap.title || `Chapter ${chap.chapterNumber}`,
                langCode: "en",
                time: new Date(),
            }));
        }
        return chapters;
    }
    // --- IMAGES ---
    async getChapterDetails(mangaId, chapterId) {
        var _a;
        const request = App.createRequest({
            url: `${API_BASE}/books/${mangaId}/file/${chapterId}`,
            method: "GET",
        });
        const response = await this.requestManager.schedule(request, 1);
        const json = JSON.parse((_a = response.data) !== null && _a !== void 0 ? _a : "{}");
        let pages = [];
        if (Array.isArray(json))
            pages = json.map((x) => (typeof x === 'string' ? x : x.url));
        else if (json.images)
            pages = json.images.map((x) => x.url);
        else if (json.data)
            pages = json.data.map((x) => x.url);
        return App.createChapterDetails({
            id: chapterId,
            mangaId: mangaId,
            pages: pages,
        });
    }
    // --- RECHERCHE ---
    async getSearchResults(query, metadata) {
        var _a, _b;
        const request = App.createRequest({
            url: `${DOMAIN}/search?q=${encodeURIComponent((_a = query.title) !== null && _a !== void 0 ? _a : "")}&_rsc=3lb4g`,
            method: "GET",
        });
        const response = await this.requestManager.schedule(request, 1);
        const items = this.parseRawData((_b = response.data) !== null && _b !== void 0 ? _b : "");
        const mangaList = [];
        for (const item of items) {
            mangaList.push(App.createPartialSourceManga({
                mangaId: item.id,
                image: item.image,
                title: item.title,
                subtitle: undefined,
            }));
        }
        return App.createPagedResults({ results: mangaList });
    }
}
exports.Kagane = Kagane;
