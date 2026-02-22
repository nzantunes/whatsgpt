#!/usr/bin/env python3
"""
Extrai links de uma URL usando requests + BeautifulSoup + regex,
incluindo varredura opcional de sublinks.

Uso:
    python extract_links.py <url> [--max-sublinks N]

Retorna JSON com texto, links e (quando habilitado) sublinks encontrados.
"""
import sys
import json
import re
from urllib.parse import urljoin, urlparse

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    print(json.dumps({"error": "Instale: pip install requests beautifulsoup4"}))
    sys.exit(1)

def is_http_url(value):
    return isinstance(value, str) and (value.startswith('http://') or value.startswith('https://'))

def should_skip_link(link):
    l = (link or '').lower()
    return any(x in l for x in [
        '.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico',
        '.woff', '.woff2', '.ttf', '.eot', '.mp4', '.mp3', '.zip', '.rar', '.pdf',
        'fonts.', 'analytics', 'gtag', 'facebook.com/tr', 'google-analytics'
    ])

def extract_page(url, headers, timeout=30):
    response = requests.get(url, headers=headers, timeout=timeout, allow_redirects=True)
    response.raise_for_status()
    html = response.text
    soup = BeautifulSoup(html, 'html.parser')

    for tag in soup.find_all(['script', 'style']):
        tag.decompose()

    text = soup.get_text(separator=' ', strip=True)
    text = re.sub(r'\s+', ' ', text).strip()

    links = set()

    for a in soup.find_all('a', href=True):
        href = a.get('href')
        if not href:
            continue
        absolute = urljoin(url, href)
        if is_http_url(absolute):
            links.add(absolute)

    for tag in soup.find_all(True):
        for _, value in tag.attrs.items():
            if isinstance(value, str):
                absolute = urljoin(url, value)
                if is_http_url(absolute):
                    links.add(absolute)

    url_pattern = r'https?://[^\s<>"\'\\)}\]]+(?:\.[a-zA-Z]{2,})[^\s<>"\'\\)}\]]*'
    found_urls = re.findall(url_pattern, html)
    for u in found_urls:
        cleaned = re.sub(r'[,;:!?\'\"]+$', '', u)
        if len(cleaned) > 10 and '.' in cleaned:
            links.add(cleaned)

    js_url_pattern = r'["\']?(https?://[^"\'<>\s\\]+)["\']?'
    js_urls = re.findall(js_url_pattern, html)
    for u in js_urls:
        cleaned = re.sub(r'[,;:!?\'\"\\]+$', '', u)
        if len(cleaned) > 10 and '.' in cleaned:
            links.add(cleaned)

    valid_links = sorted(set(link for link in links if is_http_url(link) and not should_skip_link(link)))

    return {
        'text': text,
        'links': valid_links,
        'html': html,
    }

def crawl_sublinks(root_url, links, headers, max_sublinks=3):
    if max_sublinks <= 0:
        return []

    root_domain = urlparse(root_url).netloc.lower()
    candidates = []
    seen = set()
    for link in links:
        if not is_http_url(link):
            continue
        parsed = urlparse(link)
        if not parsed.netloc:
            continue
        if parsed.netloc.lower() != root_domain:
            continue
        clean_link = link.split('#')[0]
        if clean_link in seen or should_skip_link(clean_link):
            continue
        seen.add(clean_link)
        candidates.append(clean_link)

    sublinks = []
    for link in candidates[:max_sublinks]:
        try:
            page = extract_page(link, headers, timeout=20)
            text = page.get('text') or ''
            page_links = page.get('links') or []
            sublinks.append({
                'url': link,
                'text_length': len(text),
                'text_preview': text[:1200],
                'links': page_links[:30],
                'links_count': len(page_links),
            })
        except Exception as e:
            sublinks.append({
                'url': link,
                'error': str(e),
            })

    return sublinks

def extract_links(url, max_sublinks=3):
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
        }
        page = extract_page(url, headers=headers, timeout=30)
        text = page.get('text') or ''
        valid_links = (page.get('links') or [])[:100]
        sublinks = crawl_sublinks(url, valid_links, headers=headers, max_sublinks=max_sublinks)
        
        return {
            "success": True,
            "url": url,
            "text": text[:50000],
            "text_length": len(text),
            "links": valid_links,
            "links_count": len(valid_links),
            "sub_links": sublinks,
            "sub_links_count": len(sublinks)
        }
        
    except requests.exceptions.Timeout:
        return {"success": False, "error": "Timeout ao acessar URL"}
    except requests.exceptions.RequestException as e:
        return {"success": False, "error": f"Erro HTTP: {str(e)}"}
    except Exception as e:
        return {"success": False, "error": str(e)}

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Uso: python extract_links.py <url> [--max-sublinks N]"}))
        sys.exit(1)

    url = sys.argv[1]
    max_sublinks = 3
    if '--max-sublinks' in sys.argv:
        idx = sys.argv.index('--max-sublinks')
        if idx + 1 < len(sys.argv):
            try:
                max_sublinks = max(0, int(sys.argv[idx + 1]))
            except Exception:
                max_sublinks = 3

    result = extract_links(url, max_sublinks=max_sublinks)
    print(json.dumps(result, ensure_ascii=False))
