import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const url = searchParams.get('url');

        if (!url) {
            return NextResponse.json({ error: 'URL is required' }, { status: 400 });
        }

        // Validate URL
        try {
            new URL(url);
        } catch {
            return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
        }

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            next: { revalidate: 3600 } // Cache for 1 hour
        });

        if (!response.ok) {
            return NextResponse.json({ error: `Failed to fetch URL: ${response.statusText}` }, { status: 500 });
        }

        const html = await response.text();
        const $ = cheerio.load(html);
        const links: { text: string; href: string; type: 'pdf' | 'page' }[] = [];

        $('a').each((_, element) => {
            const $el = $(element);
            const href = $el.attr('href');
            let text = $el.text().trim() || $el.attr('title') || 'Untitled Link';

            if (!href || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('#')) {
                return;
            }

            // Resolve relative URLs
            let absoluteHref = href;
            try {
                absoluteHref = new URL(href, url).toString();
            } catch {
                return;
            }

            const isPdf = absoluteHref.toLowerCase().endsWith('.pdf') ||
                text.toLowerCase().includes('pdf') ||
                $el.attr('type') === 'application/pdf';

            links.push({
                text: text.slice(0, 100), // Truncate long text
                href: absoluteHref,
                type: isPdf ? 'pdf' : 'page'
            });
        });

        // Unique links only
        const uniqueLinks = Array.from(new Map(links.map(item => [item.href, item])).values());

        return NextResponse.json({
            success: true,
            links: uniqueLinks.slice(0, 100), // Limit to 100 links
            pageTitle: $('title').text().trim() || 'Unknown Page'
        });

    } catch (error: any) {
        console.error('[scrape-url] Error:', error);
        return NextResponse.json({ error: error.message || 'Scraping failed' }, { status: 500 });
    }
}

