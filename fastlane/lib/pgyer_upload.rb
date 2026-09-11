# frozen_string_literal: true

require "json"
require "open3"

# Pgyer (蒲公英) COS upload: getCOSToken → upload file → poll buildInfo.
# See https://www.pgyer.com/doc/view/api#fastUploadApp
module PgyerUpload
  API_BASES = [
    "https://www.pgyer.com/apiv2",
    "https://api.pgyer.com/apiv2",
    "https://api.xcxwo.com/apiv2"
  ].freeze
  WEB_HOST = "https://www.pgyer.com"
  BUILD_POLL_ATTEMPTS = 60
  BUILD_POLL_SLEEP = 2

  module_function

  def upload!(file: nil, apk: nil, api_key:, build_type: "android", update_description: nil, install_type: "1", password: nil)
    path = file || apk
    FastlaneCore::UI.user_error!("Install package missing: #{path}") if path.to_s.empty? || !File.file?(path)
    FastlaneCore::UI.user_error!("PGYER_API_KEY is empty") if api_key.to_s.strip.empty?

    token = fetch_cos_token(
      api_key: api_key,
      build_type: build_type,
      install_type: install_type,
      password: password,
      update_description: update_description
    )

    upload_to_cos(file: path, token: token)
    info = poll_build_info(api_key: api_key, build_key: token["key"])

    shortcut = info["buildShortcutUrl"].to_s
    url = shortcut.empty? ? nil : "#{WEB_HOST}/#{shortcut}"
    {
      "buildName" => info["buildName"],
      "buildVersion" => info["buildVersion"],
      "buildVersionNo" => info["buildVersionNo"],
      "buildShortcutUrl" => shortcut,
      "installUrl" => url,
      "buildQRCodeURL" => info["buildQRCodeURL"],
      "raw" => info
    }
  end

  def fetch_cos_token(api_key:, build_type:, install_type:, password:, update_description:)
    FastlaneCore::UI.message("Pgyer: requesting COS token…")
    forms = {
      "_api_key" => api_key,
      "buildType" => build_type,
      "buildInstallType" => install_type.to_s
    }
    forms["buildPassword"] = password if password && !password.empty?
    forms["buildUpdateDescription"] = update_description if update_description && !update_description.empty?

    last_error = nil
    API_BASES.each do |base|
      begin
        body = curl_form("#{base}/app/getCOSToken", forms)
        payload = JSON.parse(body)
        if payload["code"] != 0
          last_error = "code=#{payload['code']} message=#{payload['message']}"
          next
        end

        data = payload["data"] || {}
        params = data["params"] || {}
        %w[endpoint key].each do |k|
          FastlaneCore::UI.user_error!("Pgyer getCOSToken missing data.#{k}") if data[k].to_s.empty?
        end
        %w[key signature x-cos-security-token].each do |k|
          FastlaneCore::UI.user_error!("Pgyer getCOSToken missing params.#{k}") if params[k].to_s.empty?
        end

        FastlaneCore::UI.message("Pgyer: COS token OK (#{base})")
        return data
      rescue StandardError => e
        last_error = e.message
        FastlaneCore::UI.important("Pgyer token via #{base} failed: #{e.message}")
      end
    end

    FastlaneCore::UI.user_error!("Pgyer getCOSToken failed: #{last_error}")
  end

  def upload_to_cos(file:, token:)
    endpoint = token["endpoint"]
    params = token["params"]
    file_name = File.basename(file)
    size_mb = (File.size(file) / 1024.0 / 1024.0).round(1)
    FastlaneCore::UI.message("Pgyer: uploading #{file_name} (#{size_mb} MB)…")

    # COS success is HTTP 204 with empty body.
    cmd = [
      "curl", "-sS", "-o", "/dev/null", "-w", "%{http_code}",
      "--connect-timeout", "30", "--max-time", "1800",
      "--form-string", "key=#{params['key']}",
      "--form-string", "signature=#{params['signature']}",
      "--form-string", "x-cos-security-token=#{params['x-cos-security-token']}",
      "--form-string", "x-cos-meta-file-name=#{file_name}",
      "-F", "file=@#{file}",
      endpoint
    ]
    http_code = Open3.capture2(*cmd).first.strip
    FastlaneCore::UI.user_error!("Pgyer COS upload failed (HTTP #{http_code}, expected 204)") unless http_code == "204"
    FastlaneCore::UI.success("Pgyer: file uploaded")
  end

  def poll_build_info(api_key:, build_key:)
    FastlaneCore::UI.message("Pgyer: waiting for build processing…")
    last_body = nil

    BUILD_POLL_ATTEMPTS.times do |i|
      API_BASES.each do |base|
        begin
          body = curl_get("#{base}/app/buildInfo", "_api_key" => api_key, "buildKey" => build_key)
          last_body = body
          payload = JSON.parse(body)
          code = payload["code"]
          if code == 0
            data = payload["data"] || {}
            FastlaneCore::UI.success("Pgyer: build ready")
            return data
          end
          # Non-zero often means still processing; keep polling.
          FastlaneCore::UI.message("Pgyer: processing… (#{i + 1}/#{BUILD_POLL_ATTEMPTS}, code=#{code})") if (i % 5).zero?
          break
        rescue StandardError => e
          FastlaneCore::UI.important("Pgyer buildInfo via #{base}: #{e.message}")
        end
      end
      sleep BUILD_POLL_SLEEP
    end

    FastlaneCore::UI.user_error!("Pgyer buildInfo timed out. Last response: #{last_body}")
  end

  def curl_form(url, forms)
    args = ["curl", "-sS", "--connect-timeout", "20", "--max-time", "60"]
    forms.each { |k, v| args += ["--form-string", "#{k}=#{v}"] }
    args << url
    out, status = Open3.capture2(*args)
    FastlaneCore::UI.user_error!("curl failed for #{url} (exit #{status.exitstatus})") unless status.success?
    out
  end

  def curl_get(url, params)
    args = ["curl", "-sS", "--get", "--connect-timeout", "20", "--max-time", "60"]
    params.each { |k, v| args += ["--data-urlencode", "#{k}=#{v}"] }
    args << url
    out, status = Open3.capture2(*args)
    FastlaneCore::UI.user_error!("curl failed for #{url} (exit #{status.exitstatus})") unless status.success?
    out
  end
end
