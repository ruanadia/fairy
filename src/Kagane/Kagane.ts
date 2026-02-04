import {
  Source,
  MangaProviding,
  ChapterProviding,
  SearchResultsProviding,
  HomePageSectionsProviding,
  SourceInfo,
  ContentRating,
  BadgeColor,
  SourceIntents,
  Request,
  Response,
  SourceManga,
  Chapter,
  ChapterDetails,
  HomeSection,
  PagedResults,
  SearchRequest,
  HomeSectionType,
  DUISection,
} from "@paperback/types";

// --- CONSTANTS & CONFIG (Inspiré de Common.ts) ---
const API_BASE = "https://api.kagane.org/api/v1";
const DOMAIN = "https://kagane.org";

// --- INTERFACES (Pour typer les données Kagane) ---
interface KaganeSeries {
  id: string;
  name?: string;
  title?: string;
  thumbnail?: string;
  cover?: string;
  summary?: string;
  description?: string;
  status?: string;
  authors?: string[];
  artists?: string[];
  createdAt?: string;
  updatedAt?: string;
}

interface KaganeChapter {
  id: string;
  title?: string;
  name?: string;
  chapterNumber?: number;
  number?: number;
  sequenceNumber?: number;
  createdAt?: string;
}

// --- INFO EXTENSION ---
export const KaganeInfo: SourceInfo = {
  version: "1.3.0", // 🚀 Version ComixTo Style
  name: "Kagane",
  icon: "icon.png",
  author: "Toi",
  authorWebsite: "https://github.com/ruanadia",
  description: "Extension Kagane (Architecture ComixTo)",
  contentRating: ContentRating.MATURE,
  websiteBaseURL: DOMAIN,
  intents:
    SourceIntents.MANGA_CHAPTERS |
    SourceIntents.HOMEPAGE_SECTIONS,
};

// --- CLASSE PRINCIPALE (Architecture ComixTo) ---
export class Kagane
  extends Source
  implements
    MangaProviding,
    ChapterProviding,
    SearchResultsProviding,
    HomePageSectionsProviding
{
  // State Manager comme ComixTo
  stateManager = App.createSourceStateManager();

  // Request Manager avec Interceptor (C'est le secret de ComixTo)
  requestManager = App.createRequestManager({
    requestsPerSecond: 4,
    requestTimeout: 15000,
    interceptor: {
      interceptRequest: async (request: Request): Promise<Request> => {
        request.headers = {
          ...(request.headers ?? {}),
          Referer: `${DOMAIN}/`,
          Origin: DOMAIN,
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
        };
        return request;
      },
      interceptResponse: async (response: Response): Promise<Response> => {
        return response;
      },
    },
  });

  // --- PARSER INTERNE (Adapté de Parser.ts) ---

  // Helper pour nettoyer les images Kagane/Next.js
  private getImage(item: any): string {
    let image = item.thumbnail || item.cover || item.image || "";
    if (image && !image.startsWith("http")) {
       // On essaie de reconstruire l'URL propre
       return `${DOMAIN}/_next/image?url=${encodeURIComponent(image)}&w=384&q=75`;
    }
    return image || "https://kagane.org/favicon.ico";
  }

  // --- MANGA DETAILS ---
  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const request = App.createRequest({
      url: `${API_BASE}/series/${mangaId}`,
      method: "GET",
    });

    const response = await this.requestManager.schedule(request, 1);
    const json = JSON.parse(response.data ?? "{}");
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
  async getChapters(mangaId: string): Promise<Chapter[]> {
    // Sur Kagane, les chapitres sont souvent inclus dans les détails de la série
    // Mais on peut aussi avoir une pagination, on prend la liste simple pour commencer
    const request = App.createRequest({
      url: `${API_BASE}/series/${mangaId}`,
      method: "GET",
    });

    const response = await this.requestManager.schedule(request, 1);
    const json = JSON.parse(response.data ?? "{}");
    const data = json.data || json;
    
    // On cherche la liste des "books" ou "chapters"
    const rawChapters: KaganeChapter[] = data.books || data.chapters || [];
    
    const chapters: Chapter[] = [];
    for (const chap of rawChapters) {
      chapters.push(
        App.createChapter({
          id: String(chap.id),
          chapNum: Number(chap.chapterNumber || chap.number || chap.sequenceNumber || 0),
          name: chap.title || chap.name || `Chapter ${chap.chapterNumber}`,
          langCode: "en",
          time: chap.createdAt ? new Date(chap.createdAt) : new Date(),
        })
      );
    }
    return chapters;
  }

  // --- CHAPTER IMAGES ---
  async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
    const request = App.createRequest({
      url: `${API_BASE}/books/${mangaId}/file/${chapterId}`,
      method: "GET",
    });

    const response = await this.requestManager.schedule(request, 1);
    const json = JSON.parse(response.data ?? "{}");
    
    let pages: string[] = [];
    // L'API renvoie soit un tableau direct, soit { images: [...] }
    if (Array.isArray(json)) {
        pages = json.map((x: any) => (typeof x === 'string' ? x : x.url));
    } else if (json.images && Array.isArray(json.images)) {
        pages = json.images.map((x: any) => x.url);
    } else if (json.data && Array.isArray(json.data)) {
        pages = json.data.map((x: any) => x.url);
    }

    return App.createChapterDetails({
      id: chapterId,
      mangaId: mangaId,
      pages: pages,
    });
  }

  // --- HOME PAGE (Méthode ComixTo : fetchHomeData helper) ---
  async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {
    const sections = [
      App.createHomeSection({
        id: "popular",
        title: "Popular (Most Views)",
        containsMoreItems: true,
        type: HomeSectionType.singleRowNormal,
      }),
      App.createHomeSection({
        id: "latest",
        title: "Latest Updates",
        containsMoreItems: true,
        type: HomeSectionType.singleRowNormal,
      }),
    ];

    const promises: Promise<void>[] = [];

    // Section 1: Popular (tri par vues)
    promises.push(
      this.fetchHomeData(
        `${API_BASE}/series?sort=views&order=desc&page=1&take=20`,
        sections[0],
        sectionCallback
      )
    );

    // Section 2: Latest (tri par date modif)
    promises.push(
      this.fetchHomeData(
        `${API_BASE}/series?sort=last_modified&order=desc&page=1&take=20`,
        sections[1],
        sectionCallback
      )
    );

    await Promise.all(promises);
  }

  // Helper inspiré de ComixTo pour charger une section
  async fetchHomeData(url: string, section: HomeSection, callback: (section: HomeSection) => void) {
    const request = App.createRequest({ url, method: "GET" });
    
    try {
        const response = await this.requestManager.schedule(request, 1);
        const json = JSON.parse(response.data ?? "{}");
        
        let items: KaganeSeries[] = [];
        if (Array.isArray(json)) items = json;
        else if (json.data && Array.isArray(json.data)) items = json.data;
        else if (json.series && Array.isArray(json.series)) items = json.series;

        const mangaList = [];
        for (const item of items) {
            if (!item.id) continue;
            mangaList.push(
                App.createPartialSourceManga({
                    mangaId: String(item.id),
                    image: this.getImage(item),
                    title: item.title || item.name || "Unknown",
                    subtitle: undefined,
                })
            );
        }
        section.items = mangaList;
    } catch (e) {
        console.log(`Error fetching section ${section.id}: ${e}`);
        section.items = [];
    }
    
    callback(section);
  }

  // --- VIEW MORE (Pagination comme ComixTo) ---
  async getViewMoreItems(homepageSectionId: string, metadata: any): Promise<PagedResults> {
    const page = metadata?.page ?? 1;
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
    const json = JSON.parse(response.data ?? "{}");
    
    let items: KaganeSeries[] = [];
    if (Array.isArray(json)) items = json;
    else if (json.data && Array.isArray(json.data)) items = json.data;

    const mangaList = [];
    for (const item of items) {
        mangaList.push(
            App.createPartialSourceManga({
                mangaId: String(item.id),
                image: this.getImage(item),
                title: item.title || item.name || "Unknown",
            })
        );
    }

    // Pagination simple : si on a reçu des items, on suppose qu'il y a une page suivante
    const hasNext = items.length > 0;

    return App.createPagedResults({
      results: mangaList,
      metadata: hasNext ? { page: page + 1 } : undefined,
    });
  }

  // --- SEARCH (Comme ComixTo, sans les filtres avancés pour l'instant) ---
  async getSearchResults(query: SearchRequest, metadata: any): Promise<PagedResults> {
    const page = metadata?.page ?? 1;
    // Recherche simple
    const url = `${API_BASE}/series?search=${encodeURIComponent(query.title ?? "")}&page=${page}&take=20`;
    
    const request = App.createRequest({ url, method: "GET" });
    const response = await this.requestManager.schedule(request, 1);
    const json = JSON.parse(response.data ?? "{}");
    
    let items: KaganeSeries[] = [];
    if (Array.isArray(json)) items = json;
    else if (json.data && Array.isArray(json.data)) items = json.data;

    const mangaList = [];
    for (const item of items) {
        mangaList.push(
            App.createPartialSourceManga({
                mangaId: String(item.id),
                image: this.getImage(item),
                title: item.title || item.name || "Unknown",
            })
        );
    }

    return App.createPagedResults({
      results: mangaList,
      metadata: items.length > 0 ? { page: page + 1 } : undefined,
    });
  }
}