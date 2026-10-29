#!/usr/bin/env ruby
# frozen_string_literal: true

require "date"
require "yaml"

ROOT = File.expand_path("..", __dir__)

# Fields that must have an English counterpart (`<field>_en`) when present.
DATA_RULES = {
  "profile.yml" => %w[title summary location],
  "experience.yml" => %w[position duration summary tags],
  "education.yml" => %w[degree uni thesis thesis_label award award_meta],
  "projects.yml" => %w[tagline description tags],
  "skills.yml" => %w[group]
}.freeze

POST_REQUIRED_FIELDS = %w[title title_en description description_en date layout].freeze

errors = []
warnings = []
checked = 0

def present?(value)
  case value
  when nil
    false
  when String
    !value.strip.empty?
  when Array, Hash
    !value.empty?
  else
    true
  end
end

def load_yaml(path)
  YAML.safe_load(File.read(path), permitted_classes: [Date, Time], aliases: true)
rescue Psych::SyntaxError => e
  raise "invalid YAML: #{e.message}"
end

def relative(path)
  path.delete_prefix("#{ROOT}/")
end

def record_label(record, index)
  record["name"] || record["company"] || record["degree"] || record["group"] || "record #{index + 1}"
end

# Validate structured CV data.
Dir[File.join(ROOT, "_data", "*.yml")].sort.each do |path|
  file = File.basename(path)
  fields = DATA_RULES[file]
  next unless fields

  begin
    data = load_yaml(path)
  rescue StandardError => e
    errors << "#{relative(path)}: #{e.message}"
    next
  end

  records =
    case data
    when Array then data
    when Hash then [data]
    else
      errors << "#{relative(path)}: expected a mapping or a list of mappings"
      next
    end

  records.each_with_index do |record, index|
    unless record.is_a?(Hash)
      errors << "#{relative(path)}[#{index}]: expected a mapping"
      next
    end

    label = record_label(record, index)
    fields.each do |field|
      next unless present?(record[field])

      english_field = "#{field}_en"
      next if present?(record[english_field])

      errors << "#{relative(path)} → #{label}: missing `#{english_field}`"
    end
  end

  checked += 1
end

# Validate bilingual blog posts.
Dir[File.join(ROOT, "_posts", "*.{markdown,md}")].sort.each do |path|
  content = File.read(path)
  rel = relative(path)
  front_matter = content.match(/\A---\s*\n(.*?)\n---\s*\n/m)

  unless front_matter
    errors << "#{rel}: missing YAML front matter"
    next
  end

  begin
    front = YAML.safe_load(front_matter[1], permitted_classes: [Date, Time], aliases: true)
  rescue Psych::SyntaxError => e
    errors << "#{rel}: invalid front matter: #{e.message}"
    next
  end

  unless front.is_a?(Hash)
    errors << "#{rel}: front matter must be a mapping"
    next
  end

  POST_REQUIRED_FIELDS.each do |field|
    errors << "#{rel}: missing front matter field `#{field}`" unless present?(front[field])
  end

  if present?(front["layout"]) && front["layout"] != "blog"
    errors << "#{rel}: expected `layout: blog`"
  end

  categories = front["categories"]
  categories = categories.split if categories.is_a?(String)
  categories = Array(categories)

  unless categories.map(&:to_s).include?("blog")
    errors << "#{rel}: expected `categories` to include `blog`"
  end

  if front.key?("reading_time")
    reading_time = front["reading_time"]
    unless reading_time.is_a?(Integer) && reading_time.positive?
      errors << "#{rel}: `reading_time` must be a positive integer"
    end
  else
    warnings << "#{rel}: `reading_time` is missing; set it manually for bilingual posts"
  end

  body = content.sub(/\A---\s*\n.*?\n---\s*\n/m, "")
  es_blocks = body.scan(/<(?:p|div)\b[^>]*class=(["'])[^"']*\blang-es\b[^"']*\1[^>]*>(.*?)<\/(?:p|div)>/m)
  en_blocks = body.scan(/<(?:p|div)\b[^>]*class=(["'])[^"']*\blang-en\b[^"']*\1[^>]*>(.*?)<\/(?:p|div)>/m)

  {
    "lang-es" => es_blocks,
    "lang-en" => en_blocks
  }.each do |lang, blocks|
    if blocks.empty?
      errors << "#{rel}: missing a `#{lang}` content block"
      next
    end

    blocks.each_with_index do |(_, text), index|
      plain_text = text.gsub(/<[^>]+>/, "").gsub(/&[a-z0-9#]+;/i, " ").strip
      errors << "#{rel}: `#{lang}` block #{index + 1} is empty" if plain_text.empty?
    end
  end

  checked += 1
end

puts "Bilingual content check"
puts "======================="
puts

warnings.each { |warning| puts "WARN  #{warning}" }
errors.each { |error| puts "ERROR #{error}" }

puts
if errors.empty?
  puts "OK: #{checked} file(s) checked, #{warnings.size} warning(s)."
else
  puts "FAILED: #{errors.size} error(s), #{warnings.size} warning(s)."
  exit 1
end
