"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Kagane = exports.KaganeInfo = void 0;
const types_1 = require("@paperback/types");
// --- CONSTANTS & CONFIG (Inspiré de Common.ts) ---
const API_BASE = "https://api.kagane.org/api/v1";
const DOMAIN = "https://kagane.org";
// --- INFO EXTENSION ---
exports.KaganeInfo = {
    version: "1.3.0", // 🚀 Version ComixTo Style
    name: "Kagane",
    icon: "icon.png",
    author: "Toi",
    authorWebsite: "https://github.com/ruanadia",
    description: "Extension Kagane (Architecture ComixTo)",
    contentRating: types_1.ContentRating.MATURE,
    websiteBaseURL: DOMAIN,
    intents: types_1.SourceIntents.MANGA_CHAPTERS |
        types_1.SourceIntents.HOMEPAGE_SECTIONS,
};
// --- CLASSE PRINCIPALE (Architecture ComixTo) ---
class Kagane extends types_1.Source {
    constructor() {
        super(...arguments);
        // State Manager comme ComixTo
        this.stateManager = App.createSourceStateManager();
        // Request Manager avec Interceptor (C'est le secret de ComixTo)
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
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
                    };
                    return request;
                },
                interceptResponse: async (response) => {
                    return response;
                },
            },
        });
    }
    // --- PARSER INTERNE (Adapté de Parser.ts) ---
    // Helper pour nettoyer les images Kagane/Next.js
    getImage(item) {
        let image = item.thumbnail || item.cover || item.image || "";
        if (image && !image.startsWith("http")) {
            // On essaie de reconstruire l'URL propre
            return `${DOMAIN}/_next/image?url=${encodeURIComponent(image)}&w=384&q=75`;
        }
        return image || "https://kagane.org/favicon.ico";
    }
    // --- MANGA DETAILS ---
    async getMangaDetails(mangaId) {
        var _a;
        const request = App.createRequest({
            url: `${API_BASE}/series/${mangaId}`,
            method: "GET",
        });
        const response = await this.requestManager.schedule(request, 1);
        const json = JSON.parse((_a = response.data) !== null && _a !== void 0 ? _a : "{}");
        // Kagane API v1 met parfois les données dans `data` ou direct à la racine
        const data = json.data || json;
        return App.createSourceManga({
            id: mangaId,
            mangaInfo: App.createMangaInfo({
                titles: [data.title || data.name || "Unknown"],
                image: this.getImage(data),
                status: data.status === "ONGOING" ? "Ongoing" : "Completed",
                desc: data.summary || data.description || "No description",
                author: data.authors ? data.authors.join(", ") : "",
                artist: data.artists ? data.artists.join(", ") : "",
            }),
        });
    }
    // --- CHAPTERS ---
    async getChapters(mangaId) {
        var _a;
        // Sur Kagane, les chapitres sont souvent inclus dans les détails de la série
        // Mais on peut aussi avoir une pagination, on prend la liste simple pour commencer
        const request = App.createRequest({
            url: `${API_BASE}/series/${mangaId}`,
            method: "GET",
        });
        const response = await this.requestManager.schedule(request, 1);
        const json = JSON.parse((_a = response.data) !== null && _a !== void 0 ? _a : "{}");
        const data = json.data || json;
        // On cherche la liste des "books" ou "chapters"
        const rawChapters = data.books || data.chapters || [];
        const chapters = [];
        for (const chap of rawChapters) {
            chapters.push(App.createChapter({
                id: String(chap.id),
                chapNum: Number(chap.chapterNumber || chap.number || chap.sequenceNumber || 0),
                name: chap.title || chap.name || `Chapter ${chap.chapterNumber}`,
                langCode: "en",
                time: chap.createdAt ? new Date(chap.createdAt) : new Date(),
            }));
        }
        return chapters;
    }
    // --- CHAPTER IMAGES ---
    async getChapterDetails(mangaId, chapterId) {
        var _a;
        const request = App.createRequest({
            url: `${API_BASE}/books/${mangaId}/file/${chapterId}`,
            method: "GET",
        });
        const response = await this.requestManager.schedule(request, 1);
        const json = JSON.parse((_a = response.data) !== null && _a !== void 0 ? _a : "{}");
        let pages = [];
        // L'API renvoie soit un tableau direct, soit { images: [...] }
        if (Array.isArray(json)) {
            pages = json.map((x) => (typeof x === 'string' ? x : x.url));
        }
        else if (json.images && Array.isArray(json.images)) {
            pages = json.images.map((x) => x.url);
        }
        else if (json.data && Array.isArray(json.data)) {
            pages = json.data.map((x) => x.url);
        }
        return App.createChapterDetails({
            id: chapterId,
            mangaId: mangaId,
            pages: pages,
        });
    }
    // --- HOME PAGE (Méthode ComixTo : fetchHomeData helper) ---
    async getHomePageSections(sectionCallback) {
        const sections = [
            App.createHomeSection({
                id: "popular",
                title: "Popular (Most Views)",
                containsMoreItems: true,
                type: types_1.HomeSectionType.singleRowNormal,
            }),
            App.createHomeSection({
                id: "latest",
                title: "Latest Updates",
                containsMoreItems: true,
                type: types_1.HomeSectionType.singleRowNormal,
            }),
        ];
        const promises = [];
        // Section 1: Popular (tri par vues)
        promises.push(this.fetchHomeData(`${API_BASE}/series?sort=views&order=desc&page=1&take=20`, sections[0], sectionCallback));
        // Section 2: Latest (tri par date modif)
        promises.push(this.fetchHomeData(`${API_BASE}/series?sort=last_modified&order=desc&page=1&take=20`, sections[1], sectionCallback));
        await Promise.all(promises);
    }
    // Helper inspiré de ComixTo pour charger une section
    async fetchHomeData(url, section, callback) {
        var _a;
        const request = App.createRequest({ url, method: "GET" });
        try {
            const response = await this.requestManager.schedule(request, 1);
            const json = JSON.parse((_a = response.data) !== null && _a !== void 0 ? _a : "{}");
            let items = [];
            if (Array.isArray(json))
                items = json;
            else if (json.data && Array.isArray(json.data))
                items = json.data;
            else if (json.series && Array.isArray(json.series))
                items = json.series;
            const mangaList = [];
            for (const item of items) {
                if (!item.id)
                    continue;
                mangaList.push(App.createPartialSourceManga({
                    mangaId: String(item.id),
                    image: this.getImage(item),
                    title: item.title || item.name || "Unknown",
                    subtitle: undefined,
                }));
            }
            section.items = mangaList;
        }
        catch (e) {
            console.log(`Error fetching section ${section.id}: ${e}`);
            section.items = [];
        }
        callback(section);
    }
    // --- VIEW MORE (Pagination comme ComixTo) ---
    async getViewMoreItems(homepageSectionId, metadata) {
        var _a, _b;
        const page = (_a = metadata === null || metadata === void 0 ? void 0 : metadata.page) !== null && _a !== void 0 ? _a : 1;
        let url = "";
        switch (homepageSectionId) {
            case "popular":
                url = `${API_BASE}/series?sort=views&order=desc&page=${page}&take=20`;
                break;
            case "latest":
                url = `${API_BASE}/series?sort=last_modified&order=desc&page=${page}&take=20`;
                break;
            default:
                return App.createPagedResults({ results: [], metadata: undefined });
        }
        const request = App.createRequest({ url, method: "GET" });
        const response = await this.requestManager.schedule(request, 1);
        const json = JSON.parse((_b = response.data) !== null && _b !== void 0 ? _b : "{}");
        let items = [];
        if (Array.isArray(json))
            items = json;
        else if (json.data && Array.isArray(json.data))
            items = json.data;
        const mangaList = [];
        for (const item of items) {
            mangaList.push(App.createPartialSourceManga({
                mangaId: String(item.id),
                image: this.getImage(item),
                title: item.title || item.name || "Unknown",
            }));
        }
        // Pagination simple : si on a reçu des items, on suppose qu'il y a une page suivante
        const hasNext = items.length > 0;
        return App.createPagedResults({
            results: mangaList,
            metadata: hasNext ? { page: page + 1 } : undefined,
        });
    }
    // --- SEARCH (Comme ComixTo, sans les filtres avancés pour l'instant) ---
    async getSearchResults(query, metadata) {
        var _a, _b, _c;
        const page = (_a = metadata === null || metadata === void 0 ? void 0 : metadata.page) !== null && _a !== void 0 ? _a : 1;
        // Recherche simple
        const url = `${API_BASE}/series?search=${encodeURIComponent((_b = query.title) !== null && _b !== void 0 ? _b : "")}&page=${page}&take=20`;
        const request = App.createRequest({ url, method: "GET" });
        const response = await this.requestManager.schedule(request, 1);
        const json = JSON.parse((_c = response.data) !== null && _c !== void 0 ? _c : "{}");
        let items = [];
        if (Array.isArray(json))
            items = json;
        else if (json.data && Array.isArray(json.data))
            items = json.data;
        const mangaList = [];
        for (const item of items) {
            mangaList.push(App.createPartialSourceManga({
                mangaId: String(item.id),
                image: this.getImage(item),
                title: item.title || item.name || "Unknown",
            }));
        }
        return App.createPagedResults({
            results: mangaList,
            metadata: items.length > 0 ? { page: page + 1 } : undefined,
        });
    }
}
exports.Kagane = Kagane;
