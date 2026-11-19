#!/usr/bin/env ruby
# frozen_string_literal: true

require "rexml/document"
require "time"
require "uri"

ROOT = File.expand_path("..", __dir__)
SITE_DIR = File.join(ROOT, "_site")
BLOG_PAGE_GLOB = File.join(
  SITE_DIR,
  "blog",
  "[0-9][0-9][0-9][0-9]",
  "[0-9][0-9]",
  "[0-9][0-9]",
  "*",
  "index.html"
)

FEEDS = {
  "es" => {
    "file" => "feed-es.xml",
    "other_file" => "feed-en.xml",
    "other_lang" => "en"
  },
  "en" => {
    "file" => "feed-en.xml",
    "other_file" => "feed-es.xml",
    "other_lang" => "es"
  }
}.freeze

errors = []

def normalize_path(path)
  return nil if path.nil? || path.empty?

  normalized = path.sub(%r{/index\.html\z}, "/").sub(%r{/+\z}, "")
  normalized.empty? ? "/" : normalized
end

def url_path(url)
  return nil if url.nil? || url.to_s.strip.empty?

  normalize_path(URI.parse(url.to_s).path)
rescue URI::InvalidURIError
  nil
end

def parse_time(value)
  return nil if value.nil? || value.to_s.strip.empty?

  Time.iso8601(value.to_s)
rescue ArgumentError
  nil
end

def load_xml(path, label, errors)
  unless File.file?(path)
    errors << "#{label}: missing `#{path.delete_prefix("#{ROOT}/")}`; run `bundle exec jekyll build` first"
    return nil
  end

  REXML::Document.new(File.read(path))
rescue REXML::ParseException => e
  message = e.message.lines.first.to_s.strip
  errors << "#{label}: invalid XML: #{message}"
  nil
end

def check_feed(lang, config, expected_paths, errors)
  label = config.fetch("file")
  path = File.join(SITE_DIR, label)
  document = load_xml(path, label, errors)
  return unless document

  root = document.root
  unless root && root.name == "feed"
    errors << "#{label}: root element is #{root&.name.inspect}, expected `feed`"
    return
  end

  if root.attributes["xml:lang"] != lang
    errors << "#{label}: root xml:lang is #{root.attributes['xml:lang'].inspect}, expected #{lang.inspect}"
  end

  links = []
  root.elements.each("link") { |link| links << link }

  self_link = links.find { |link| link.attributes["rel"] == "self" }
  self_path = self_link ? url_path(self_link.attributes["href"]) : nil
  expected_self_path = normalize_path("/#{label}")

  unless self_path == expected_self_path
    errors << "#{label}: self link points to #{self_path.inspect}, expected #{expected_self_path.inspect}"
  end

  if self_link && self_link.attributes["type"] != "application/atom+xml"
    errors << "#{label}: self link must use type application/atom+xml"
  end

  blog_link = links.find { |link| link.attributes["rel"] == "alternate" && link.attributes["type"] == "text/html" }
  unless blog_link && url_path(blog_link.attributes["href"]) == "/blog"
    errors << "#{label}: missing alternate link to /blog/"
  end

  if blog_link && blog_link.attributes["hreflang"] != lang
    errors << "#{label}: alternate blog link must use hreflang=#{lang}"
  end

  other_link = links.find { |link| link.attributes["rel"] == "alternate" && link.attributes["type"] == "application/atom+xml" }
  other_path = other_link ? url_path(other_link.attributes["href"]) : nil
  expected_other_path = normalize_path("/#{config.fetch('other_file')}")

  unless other_path == expected_other_path
    errors << "#{label}: link to the other language points to #{other_path.inspect}, expected #{expected_other_path.inspect}"
  end

  if other_link && other_link.attributes["hreflang"] != config.fetch("other_lang")
    errors << "#{label}: other-language link must use hreflang=#{config.fetch('other_lang')}"
  end

  id_path = url_path(root.elements["id"]&.text)
  unless id_path == expected_self_path
    errors << "#{label}: feed id points to #{id_path.inspect}, expected #{expected_self_path.inspect}"
  end

  updated = parse_time(root.elements["updated"]&.text)
  errors << "#{label}: feed updated timestamp is missing or invalid" unless updated

  entries = []
  root.elements.each("entry") { |entry| entries << entry }

  if entries.empty?
    errors << "#{label}: feed has no entries"
  end

  entry_paths = []
  entries.each_with_index do |entry, index|
    entry_label = "#{label} entry #{index + 1}"

    if entry.attributes["xml:lang"] != lang
      errors << "#{entry_label}: xml:lang is #{entry.attributes['xml:lang'].inspect}, expected #{lang.inspect}"
    end

    title = entry.elements["title"]&.text.to_s.strip
    errors << "#{entry_label}: missing title" if title.empty?

    id = entry.elements["id"]&.text.to_s.strip
    entry_path = url_path(id)
    if entry_path.nil?
      errors << "#{entry_label}: missing or invalid id"
    else
      entry_paths << entry_path
    end

    link = entry.elements["link"]
    link_path = link ? url_path(link.attributes["href"]) : nil
    if link_path.nil? || link_path != entry_path
      errors << "#{entry_label}: entry link does not match its id"
    end

    published = parse_time(entry.elements["published"]&.text)
    errors << "#{entry_label}: missing or invalid published timestamp" unless published

    entry_updated = parse_time(entry.elements["updated"]&.text)
    errors << "#{entry_label}: missing or invalid updated timestamp" unless entry_updated

    summary = entry.elements["summary"]&.text.to_s.strip
    errors << "#{entry_label}: missing summary" if summary.empty?

    content = entry.elements["content"]
    if content.nil?
      errors << "#{entry_label}: missing content"
      next
    end

    if content.attributes["type"] != "html"
      errors << "#{entry_label}: content must use type=\"html\""
    end

    html = content.text.to_s
    if html.strip.empty?
      errors << "#{entry_label}: content is empty"
      next
    end

    active_wrapper = /\A\s*<(?:div|p)\b[^>]*\bclass="[^"]*\blang-#{lang}\b/m
    unless html.match?(active_wrapper)
      errors << "#{entry_label}: content does not start with the lang-#{lang} wrapper"
    end

    other_wrapper = /<(?:div|p)\b[^>]*\bclass="[^"]*\blang-#{config.fetch('other_lang')}\b/m
    if html.match?(other_wrapper)
      errors << "#{entry_label}: content contains the lang-#{config.fetch('other_lang')} wrapper"
    end
  end

  if entries.length != expected_paths.length
    errors << "#{label}: has #{entries.length} entries, expected #{expected_paths.length}"
  end

  duplicates = entry_paths.tally.select { |_path, count| count > 1 }.keys
  duplicates.each { |duplicate| errors << "#{label}: duplicate entry for #{duplicate}" }

  missing = expected_paths - entry_paths
  extra = entry_paths - expected_paths
  missing.each { |post_path| errors << "#{label}: missing entry for #{post_path}" }
  extra.each { |post_path| errors << "#{label}: unexpected entry for #{post_path}" }
end

post_pages = Dir.glob(BLOG_PAGE_GLOB)
if post_pages.empty?
  errors << "No generated blog post pages found in _site/blog; run `bundle exec jekyll build` first"
end

expected_paths = post_pages.map do |file|
  normalize_path(file.delete_prefix(SITE_DIR).sub(%r{/index\.html\z}, ""))
end.sort

FEEDS.each do |lang, config|
  check_feed(lang, config, expected_paths, errors)
end

sitemap_path = File.join(SITE_DIR, "sitemap.xml")
if File.file?(sitemap_path)
  sitemap = File.read(sitemap_path)
  FEEDS.each_value do |config|
    if sitemap.include?("/#{config.fetch('file')}")
      errors << "sitemap.xml: feeds must not be indexed (`#{config.fetch('file')}` found)"
    end
  end
else
  errors << "sitemap.xml: missing; run `bundle exec jekyll build` first"
end

blog_index_path = File.join(SITE_DIR, "blog", "index.html")
if File.file?(blog_index_path)
  blog_index = File.read(blog_index_path)
  FEEDS.each_value do |config|
    unless blog_index.include?("/#{config.fetch('file')}")
      errors << "blog index: missing feed discovery for #{config.fetch('file')}"
    end
  end
  unless blog_index.include?("/suscribirse/")
    errors << "blog index: missing subscribe page link"
  end
else
  errors << "blog index: generated page is missing"
end

subscribe_path = File.join(SITE_DIR, "suscribirse", "index.html")
if File.file?(subscribe_path)
  subscribe_page = File.read(subscribe_path)
  FEEDS.each do |lang, config|
    unless subscribe_page.include?("subscribe-button lang-#{lang}")
      errors << "subscribe page: missing lang-#{lang} feed button"
    end
    unless subscribe_page.include?("/#{config.fetch('file')}")
      errors << "subscribe page: missing #{config.fetch('file')} URL"
    end
  end

  unless subscribe_page.include?("data-subscribe-feed")
    errors << "subscribe page: missing share-sheet hook"
  end

  unless subscribe_page.include?("/js/subscribe.js")
    errors << "subscribe page: missing subscribe.js"
  end
else
  errors << "subscribe page: generated page is missing"
end

if errors.empty?
  puts "Feed validation passed: #{expected_paths.length} entries in feed-es.xml and feed-en.xml."
  puts "Checked Atom structure, per-language content, entry coverage, feed discovery, subscribe page, and sitemap exclusions."
else
  errors.each { |error| warn "ERROR: #{error}" }
  warn "#{errors.length} feed validation error(s)."
  exit 1
end
