app.post("/send-video-to-contacts-grouped", async (req, res) => {
  const startTime = Date.now();
  logEndpoint('/send-video-to-contacts-grouped', 'POST', req.body, 'started');

  // ============ CONNECTION CHECK (WhatsApp bağlı mı?) ============
  if (!ready || !sock) {
    logger.error('[GROUPED-FORWARD] ❌ WhatsApp bağlı değil, istek reddedildi');
    return res.status(503).json({
      success: false,
      error: 'WhatsApp not connected',
      message: 'QR kodu taranmamış veya bağlantı kesilmiş. Lütfen önce WhatsApp\'a bağlanın.',
      ready: false
    });
  }

  // ============ BATCH AGGREGATION (N8n'den gelen parçaları topla) ============
  const {
    batchId,
    videoIndex,
    totalInBatch,
    isLastVideoInBatch,
    autoFanout
  } = req.body;

  if (batchId && totalInBatch > 1 && autoFanout) {
    // Sayısal/boolean değerleri normalize et
    const total = parseInt(totalInBatch, 10) || 1;
    const idx = parseInt(videoIndex, 10) || 1;
    const isLast =
      (typeof isLastVideoInBatch === 'boolean'
        ? isLastVideoInBatch
        : (String(isLastVideoInBatch).toLowerCase() === 'true')) ||
      idx === total;

    logger.info(
      `[BATCH] Video ${idx}/${total} alındı (batchId: ${batchId}, isLast=${isLast})`
    );

    if (!batchStore.has(batchId)) {
      // NOT: timer kaldırıldı; batch asla timeout ile silinmeyecek
      batchStore.set(batchId, {
        videos: [],
        captions: [],
        count: 0,
        total: total,
        country: req.body.country || '',
        language: req.body.language || ''
      });
    }

    const batch = batchStore.get(batchId);

    // Video ve caption'ı ekle
    const videoUrl = Array.isArray(req.body.videoUrls)
      ? req.body.videoUrls[0]
      : req.body.videoUrl;
    const caption = req.body.caption || '';

    if (videoUrl) {
      batch.videos.push(videoUrl);
      batch.captions.push(caption);
      batch.count++;
    } else {
      logger.warn(
        `[BATCH] Boş videoUrl alındı (batchId: ${batchId}, idx=${idx})`
      );
    }

    logger.info(
      `[BATCH] Durum (batchId: ${batchId}) -> count: ${batch.count}/${batch.total}`
    );

    // Son video GELMEDİYSE veya tüm videolar tamamlanmadıysa sadece batch'e ekle ve dön
    if (!isLast || batch.count < batch.total) {
      return res.status(200).json({
        success: true,
        message: 'Video added to batch',
        batchId,
        collected: batch.count,
        total: batch.total,
        pending: batch.total - batch.count
      });
    }

    // ====== BURAYA KADAR GELDİYSE: Son video geldi ve batch.count >= batch.total ======
    logger.info(
      `[BATCH] ✅ Tamamlandı: ${batchId}, ${batch.count}/${batch.total} video toplandı, işlem başlatılıyor`
    );

    // Batch verisini ana req.body'ye bas (aşağıda normal akış kullanacak)
    req.body.videoUrls = batch.videos;
    req.body.captions = batch.captions;
    req.body.country = batch.country;
    req.body.language = batch.language;

    // Batch temizle
    batchStore.delete(batchId);
    // Artık normal akış devam edecek (videoUrls array olarak hazır)
  }

  // ============ ASYNC RESPONSE (Timeout önleme) ============
  // İsteği hemen kabul et, işlemi arka planda yap
  const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  logger.info(
    `[GROUPED-FORWARD] Request ID: ${requestId}, async processing başlatıldı`
  );

  // Job store'a kaydet (tracking için)
  jobStore.set(requestId, {
    status: 'processing',
    progress: 0,
    startTime: Date.now(),
    logs: [],
    result: null,
    cancelled: false // ✅ Cancel flag
  });

  // N8n'e hemen 202 Accepted dön (timeout önleme)
  res.status(202).json({
    success: true,
    message: 'Request accepted, processing in background',
    requestId,
    ready: true,
    statusUrl: `/api/job/${requestId}`,
    note: 'Video gönderimi arka planda devam ediyor. /api/job/:requestId endpoint\'inden durumu sorgulayabilirsiniz.'
  });

  // Job helper: Log ekle (ring buffer - RAM leak önleme)
  const addJobLog = (level, message) => {
    const job = jobStore.get(requestId);
    if (job) {
      job.logs.push({
        level,
        message,
        timestamp: new Date().toISOString()
      });
      // Ring buffer: Max 1000 log tutulsun
      if (job.logs.length > MAX_JOB_LOGS) {
        job.logs.shift(); // En eskiyi sil
      }
      jobStore.set(requestId, job);
    }
  };

  // Job helper: Progress güncelle
  const updateJobProgress = progress => {
    const job = jobStore.get(requestId);
    if (job) {
      job.progress = progress;
      jobStore.set(requestId, job);
    }
  };

  // Job helper: Sonuç kaydet
  const finishJob = (status, result) => {
    const job = jobStore.get(requestId);
    if (job) {
      job.status = status; // 'completed', 'failed', 'stopped'
      job.result = result;
      job.endTime = Date.now();
      job.duration = job.endTime - job.startTime;
      jobStore.set(requestId, job);
    }
  };

  // ============ HELPER FUNCTIONS (Anti-Ban & Natural Behavior) ============

  // Socket alive check: Bağlantı kopuksa işlem yapma
  const isSockAlive = () => {
    if (!sock || !ready) {
      logger.error('[SOCK-CHECK] Socket not alive (disconnected)');
      return false;
    }
    return true;
  };

  // Jitter: Rastgele varyasyon ekler (±30% default)
  const jitter = (ms, pct = 0.3) => {
    const delta = ms * pct;
    return ms + Math.floor((Math.random() * 2 - 1) * delta);
  };

  // Shuffle: Diziyi rastgele karıştırır (doğal sıralama için)
  const shuffleInPlace = arr => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  };

  // Circuit Breaker: Ban algılama ve otomatik durdurma
  const breaker = { open: false, until: 0, reason: '' };

  const tripBreaker = (ms, reason) => {
    breaker.open = true;
    breaker.until = Date.now() + ms;
    breaker.reason = reason;
    logger.error(
      `[CIRCUIT-BREAKER] AÇILDI: ${reason}, ${ms}ms boyunca duracak`
    );
    addActivityLog('error', `🚨 Güvenlik durdurma: ${reason}`);
  };

  const breakerOk = () => {
    if (!breaker.open) return true;
    if (Date.now() >= breaker.until) {
      breaker.open = false;
      breaker.reason = '';
      logger.info('[CIRCUIT-BREAKER] Kapandı, devam ediliyor');
      return true;
    }
    return false;
  };

  // Safe Send: Hata yönetimi + retry + ban detection
  const safeSend = async (jid, content, attempt = 1) => {
    if (!breakerOk()) {
      throw new Error(`Circuit breaker açık: ${breaker.reason}`);
    }

    try {
      return await sock.sendMessage(jid, content);
    } catch (e) {
      const msg = e?.output?.payload?.message || e.message || 'unknown';
      const status = e?.output?.statusCode || e.status || 0;

      // HARD BAN: 401/403 veya "blocked/not-authorized"
      const hardBan =
        /blocked|not-?authorized|forbidden/i.test(msg) ||
        [401, 403].includes(status);

      // RATE LIMIT: 420/429 veya "rate/too many/limit"
      const rateLimit =
        /rate|too\s?many|limit/i.test(msg) ||
        [420, 429].includes(status);

      if (hardBan) {
        tripBreaker(60 * 60 * 1000, 'BAN-SUSPECTED'); // 60 dakika dur
        throw new Error(`🚨 BAN RİSKİ: ${msg}`);
      }

      if (rateLimit) {
        const backoffMs = Math.min(
          120_000,
          10_000 * Math.pow(2, attempt - 1)
        ); // Exponential backoff
        logger.warn(
          `[RATE-LIMIT] ${msg}, ${backoffMs}ms bekleniyor (attempt ${attempt})`
        );
        await delay(jitter(backoffMs, 0.25));

        if (attempt < 5) {
          return safeSend(jid, content, attempt + 1);
        }
      }

      // Genel hatalar: 3 deneme yap
      if (attempt < 3) {
        logger.warn(`[RETRY] ${msg}, tekrar deneniyor (${attempt}/3)`);
        await delay(jitter(5000, 0.3));
        return safeSend(jid, content, attempt + 1);
      }

      throw e; // Son deneme de başarısız
    }
  };

  // Chunk: Diziyi küçük parçalara böl
  const chunk = (arr, size) => {
    const result = [];
    for (let i = 0; i < arr.length; i += size) {
      result.push(arr.slice(i, i + size));
    }
    return result;
  };

  // Caption Varyasyon: Grup tipine göre farklı emoji ekle
  const addCaptionVariation = (caption, targetType) => {
    if (!caption || caption.trim() === '') return '';

    // WhatsApp caption limit: 1024 karakter (güvenli limit: 980)
    const CAPTION_MAX = 980;
    let finalCaption =
      caption.length > CAPTION_MAX
        ? caption.substring(0, CAPTION_MAX) + '...'
        : caption;

    // Grup için emoji seti (profesyonel)
    const groupEmojis = ['', ' ✨', ' 📢', ' 💼', ' 🔔'];

    // Kişi için emoji seti (samimi)
    const contactEmojis = ['', ' 👋', ' 😊', ' 🌟', ' 💫', ' ✨'];

    const emojiSet = targetType === 'group' ? groupEmojis : contactEmojis;
    const randomEmoji =
      emojiSet[Math.floor(Math.random() * emojiSet.length)];

    return finalCaption + randomEmoji;
  };

  // ========================================================================

  // Global config'den al (endpoint içinde kullanım için)
  const BASE_FORWARD_DELAY = FORWARD_DELAY || 600; // 600ms default
  const BASE_BURST_COOLDOWN = FORWARD_BURST_COOLDOWN || 60000; // 60s default

  const {
    videoUrls: rawVideoUrls,
    videoUrl: singleVideoUrl, // ✅ TEKİL FORMAT DESTEĞİ (videoUrl)
    captions: rawCaptions,
    caption: singleCaption,
    country,
    language
  } = req.body || {};

  // ============ VIDEO URL NORMALIZE (videoUrl veya videoUrls) ============
  let videoUrls = [];
  if (Array.isArray(rawVideoUrls) && rawVideoUrls.length > 0) {
    videoUrls = rawVideoUrls; // ✅ videoUrls: ["url1", "url2"]
  } else if (typeof singleVideoUrl === 'string' && singleVideoUrl.length > 0) {
    videoUrls = [singleVideoUrl]; // ✅ videoUrl: "url" → ["url"]
  }

  // ============ CAPTION NORMALIZE (caption veya captions) ============
  let captions = [];
  if (Array.isArray(rawCaptions)) {
    captions = rawCaptions; // ✅ captions: ["cap1", "cap2"]
  } else if (typeof singleCaption === 'string' && singleCaption.length > 0) {
    // Tek caption verildiyse tüm videoUrls için aynı caption kullan
    captions = videoUrls.map(() => singleCaption); // ✅ caption: "cap" → ["cap", "cap"]
  } else {
    captions = [];
  }

  logger.info('[GROUPED-FORWARD] Request received', {
    videoCount: videoUrls?.length,
    country,
    language,
    ready,
    format: rawVideoUrls
      ? 'videoUrls (array)'
      : singleVideoUrl
      ? 'videoUrl (string)'
      : 'unknown'
  });

  if (!videoUrls || videoUrls.length === 0) {
    logger.error('[GROUPED-FORWARD] Missing video URL(s)');
    logEndpoint('/send-video-to-contacts-grouped', 'POST', req.body, {
      error: 'videoUrls veya videoUrl gerekli'
    });
    return res
      .status(400)
      .json({ error: 'videoUrls (array) veya videoUrl (string) gerekli.' });
  }

  if (!ready || !sock) {
    logger.error('[GROUPED-FORWARD] WhatsApp not ready');
    logEndpoint('/send-video-to-contacts-grouped', 'POST', req.body, {
      error: 'WhatsApp hazır değil'
    });
    return res
      .status(503)
      .json({ error: "WhatsApp hazır değil. QR'ı tarayın." });
  }

  try {
    // 1) AKTİF HEDEF LİSTESİ (Unified targets: grup + kişi)
    const groupsData = loadGroups();
    let activeGroups = (groupsData.groups || []).filter(g => g.isActive);

    const contactsData = loadContacts();
    let filteredContacts = (contactsData.contacts || []).filter(
      c => c.active
    );

    // Ülke / dil filtresi SADECE kişilere uygula
    if (country) {
      filteredContacts = filteredContacts.filter(
        c => c.country === country.toUpperCase()
      );
    }
    if (language) {
      filteredContacts = filteredContacts.filter(
        c => c.language === language.toLowerCase()
      );
    }

    // unifiedTargets: Baileys JID formatında
    const unifiedTargets = [
      ...activeGroups.map(g => ({
        type: 'group',
        jid: g.id, // Baileys JID formatı (örn. groupid@g.us)
        name: g.name || 'Group'
      })),
      ...filteredContacts.map(c => ({
        type: 'contact',
        jid: `${c.phone}@s.whatsapp.net`, // Baileys JID formatı
        name: c.name || 'Contact'
      }))
    ];

    if (unifiedTargets.length === 0) {
      const errorMsg =
        'Aktif hedef bulunamadı (ne aktif grup ne uygun kişi var).';
      finishJob('failed', { error: errorMsg });
      addJobLog('error', errorMsg);
      return; // 202 zaten gönderildi, res kullanma
    }

    // DOĞAL DAVRANŞ: Hedefleri rastgele karıştır (botnet pattern'den kaçın)
    shuffleInPlace(unifiedTargets);
    logger.info(
      `[GROUPED-FORWARD] ${unifiedTargets.length} hedef karıştırıldı (doğal sıralama)`
    );

    logger.info(
      `[GROUPED-FORWARD] ${unifiedTargets.length} hedef bulundu, ${videoUrls.length} video gönderilecek`
    );
    addActivityLog(
      'info',
      `${unifiedTargets.length} hedefe ${videoUrls.length} video gönderiliyor`
    );
    addJobLog(
      'info',
      `${unifiedTargets.length} hedef bulundu, ${videoUrls.length} video gönderilecek`
    );

    // 2) İLK HEDEFE NORMAL SEND - RASTGELE KİŞİ SEÇ (Anti-ban)
    let sentMessages = [];
    let firstTarget;
    let remainingTargets; // ← Shuffle'ı korumak için burada tanımla

    // İlk hedef: Kişilerden rastgele seç (grup değil)
    const contactTargets = unifiedTargets.filter(t => t.type === 'contact');
    const groupTargets = unifiedTargets.filter(t => t.type === 'group');

    if (contactTargets.length > 0) {
      // Rastgele bir kişi seç
      const randomIndex = Math.floor(Math.random() * contactTargets.length);
      firstTarget = contactTargets[randomIndex];

      // Kalan hedefler: diğer kişiler + gruplar (rastgele karışık)
      const remainingContacts = contactTargets.filter(
        (_, idx) => idx !== randomIndex
      );
      remainingTargets = [...remainingContacts, ...groupTargets];
      shuffleInPlace(remainingTargets); // ← Bu shuffle KORUNACAK (bug fix)

      logger.info(
        `[GROUPED-FORWARD] İlk hedef (rastgele kişi): ${firstTarget.name}`
      );
      addJobLog('info', `İlk hedef seçildi: ${firstTarget.name} (contact)`);
    } else {
      // Kişi yoksa grup seç (fallback)
      firstTarget = unifiedTargets[0];
      remainingTargets = unifiedTargets.slice(1);
      shuffleInPlace(remainingTargets);
      logger.warn(
        `[GROUPED-FORWARD] Kişi bulunamadı, ilk hedef grup: ${firstTarget.name}`
      );
      addJobLog('warn', `İlk hedef grup: ${firstTarget.name} (contact yok)`);
    }

    logger.info(
      `[GROUPED-FORWARD] İlk hedef: ${firstTarget.name} (${firstTarget.type})`
    );
    addActivityLog('info', `İlk hedefe gönderiliyor: ${firstTarget.name}`);

    // Socket bağlantısını kontrol et (disconnect durumunda devam etme)
    if (!isSockAlive()) {
      const errorMsg = 'WhatsApp bağlantısı koptu, işlem yapılamıyor';
      finishJob('failed', { error: errorMsg });
      addJobLog('error', errorMsg);
      return; // 202 zaten gönderildi
    }

    // ✅ TÜM VİDEOLARI ÖNCE İNDİR (cache'le)
    logger.info(
      `[DOWNLOAD] ${videoUrls.length} video indiriliyor (ilk hedef için)...`
    );
    addJobLog(
      'info',
      `${videoUrls.length} video indiriliyor (ilk hedef için)...`
    );
    const cachedPaths = [];
    for (let i = 0; i < videoUrls.length; i++) {
      logger.info(
        `[DOWNLOAD] Video ${i + 1}/${videoUrls.length} indiriliyor...`
      );
      const downloadStart = Date.now();
      const cachedPath = await getOrCacheVideo(videoUrls[i]);
      const downloadTime = Date.now() - downloadStart;
      cachedPaths.push(cachedPath);
      logger.info(
        `[DOWNLOAD] ✅ Video ${i + 1} indirildi (${downloadTime}ms)`
      );
    }
    addJobLog(
      'success',
      `${videoUrls.length} video indirildi, ilk hedefe gönderim başlatılıyor`
    );
    logger.info(
      `[DOWNLOAD] ✅ Tüm videolar indirildi, ilk hedefe gönderime başlanıyor`
    );

    // ✅ İNDİRİLEN VIDEOLARI İLK HEDEFE GÖNDER
    for (let i = 0; i < videoUrls.length; i++) {
      const cachedPath = cachedPaths[i];
      const baseCap = captions && captions[i] ? captions[i] : '';

      // Caption varyasyon ekle (ilk hedef için)
      const cap = addCaptionVariation(baseCap, firstTarget.type);

      logger.info(
        `[SEND] (FIRST TARGET) Video ${i + 1}/${videoUrls.length} gönderiliyor...`
      );

      // ✅ Buffer kullan (en güvenilir yöntem)
      const videoBuffer = fs.readFileSync(cachedPath);

      const sendStart = Date.now();

      // safeSend kullan (ban detection + retry)
      const sentMsg = await safeSend(firstTarget.jid, {
        video: videoBuffer,
        caption: cap,
        mimetype: 'video/mp4'
      });

      const sendTime = Date.now() - sendStart;

      // ✅ VALIDATION: Baileys response kontrolü
      if (!sentMsg || !sentMsg.key) {
        const errorMsg = `Send başarısız: Baileys invalid response (video ${
          i + 1
        })`;
        logger.error('[SEND-ERROR] ' + errorMsg, { sentMsg });
        addActivityLog('error', errorMsg);
        throw new Error(errorMsg);
      }

      sentMessages.push(sentMsg);

      logger.info(
        `[SEND] (FIRST TARGET) Video ${i + 1}/${videoUrls.length} gönderildi`,
        {
          target: firstTarget.name,
          sendTime,
          messageKey: sentMsg.key.id,
          hasKey: !!sentMsg.key,
          hasRemoteJid: !!sentMsg.key?.remoteJid
        }
      );

      // İstatistik
      global.monitorStats.totalProcessed++;
      global.monitorStats.todayCount++;

      // Anti-spam delay (jitter ile ~2s)
      await delay(jitter(2000, 0.3));
    }

    addActivityLog(
      'success',
      `İlk send tamamlandı: ${firstTarget.name} (${videoUrls.length} video)`
    );
    addJobLog('success', `İlk send tamamlandı: ${firstTarget.name}`);
    logger.info(
      `[GROUPED-FORWARD] İlk hedefe send tamamlandı: ${videoUrls.length} video`
    );
    updateJobProgress(10); // %10 tamamlandı

    // 3) DİĞER HEDEFLERE FORWARD (Chunk + SafeSend sistemi)
    const targetChunks = chunk(remainingTargets, CHUNK_SIZE); // Environment variable'dan oku

    let forwardedCount = 0;
    let totalFailed = 0;

    logger.info(
      `[GROUPED-FORWARD] ${remainingTargets.length} hedefe forward başlıyor (${targetChunks.length} chunk, chunk size: ${CHUNK_SIZE})`
    );
    addJobLog(
      'info',
      `${remainingTargets.length} hedefe forward başlatıldı (${targetChunks.length} chunk)`
    );

    for (let chunkIdx = 0; chunkIdx < targetChunks.length; chunkIdx++) {
      // ✅ CANCEL CHECK: Her chunk başında kontrol et
      const job = jobStore.get(requestId);
      if (job && job.cancelled) {
        logger.warn(
          `[CHUNK ${chunkIdx + 1}] ⚠️ İşlem iptal edildi, durduruluyor...`
        );
        addJobLog(
          'warn',
          `İşlem ${forwardedCount} kişiye gönderildikten sonra durduruldu`
        );
        finishJob('cancelled', {
          message: 'İşlem kullanıcı tarafından durduruldu',
          sentCount: forwardedCount + 1,
          totalTargets: remainingTargets.length + 1,
          cancelledAt: chunkIdx + 1,
          totalChunks: targetChunks.length
        });
        return; // İşlemi tamamen bitir
      }

      const currentChunk = targetChunks[chunkIdx];
      logger.info(
        `[CHUNK ${chunkIdx + 1}/${targetChunks.length}] ${currentChunk.length} hedef işleniyor...`
      );

      for (const target of currentChunk) {
        // ✅ UPLOAD ROTATION: Her UPLOAD_PER_SIZE kişide bir yeni upload yap
        const shouldUpload =
          UPLOAD_PER_SIZE > 0 &&
          (forwardedCount + 1) % UPLOAD_PER_SIZE === 0;

        if (shouldUpload) {
          logger.info(
            `[UPLOAD-ROTATION] ${forwardedCount + 1}. hedef: Yeni upload yapılıyor → ${target.name}`
          );
          addJobLog(
            'info',
            `Upload rotation: ${forwardedCount + 1}. hedefte yeni upload (${target.name})`
          );
          addActivityLog(
            'info',
            `📤 ${forwardedCount + 1}. hedef: Yeni upload → ${target.name}`
          );

          // ✅ FIX: Önce tüm videoları indir (upload rotation için)
          const uploadCachedPaths = [];
          for (let i = 0; i < videoUrls.length; i++) {
            logger.info(
              `[UPLOAD-ROTATION] Video ${i + 1}/${videoUrls.length} indiriliyor...`
            );
            const downloadStart = Date.now();
            const cachedPath = await getOrCacheVideo(videoUrls[i]);
            const downloadTime = Date.now() - downloadStart;
            uploadCachedPaths.push(cachedPath);
            logger.info(
              `[UPLOAD-ROTATION] ✅ Video ${i + 1} indirildi (${downloadTime}ms)`
            );
          }

          // Yeni upload (indirilen videoları bu hedefe send et)
          for (let i = 0; i < videoUrls.length; i++) {
            const cachedPath = uploadCachedPaths[i];
            const baseCap = captions && captions[i] ? captions[i] : '';
            const cap = addCaptionVariation(baseCap, target.type);

            const videoBuffer = fs.readFileSync(cachedPath);

            const uploadStart = Date.now();
            const uploadMsg = await safeSend(target.jid, {
              video: videoBuffer,
              caption: cap,
              mimetype: 'video/mp4'
            });
            const uploadTime = Date.now() - uploadStart;

            // ✅ VALIDATION: Upload response kontrolü
            if (!uploadMsg || !uploadMsg.key) {
              logger.error(
                `[UPLOAD-ERROR] Upload başarısız (video ${
                  i + 1
                }), eski mesajlar korunuyor`
              );
              addActivityLog(
                'warning',
                `Upload başarısız: ${target.name}, forward devam ediyor`
              );
              break; // Upload iptal, eski sentMessages ile devam et
            }

            sentMessages[i] = uploadMsg; // Yeni upload mesajları kaydet
            logger.info(
              `[UPLOAD-ROTATION] Video ${i + 1} upload edildi (${uploadTime}ms) → ${target.name}`
            );
            await delay(jitter(2000, 0.3));
          }

          forwardedCount++; // Upload hedefi sayılır
          addJobLog('success', `Upload rotation tamamlandı: ${target.name}`);
          logger.info(
            `[UPLOAD-ROTATION] ✅ Yeni upload tamamlandı: ${target.name}`
          );

          // İstatistik
          global.monitorStats.totalProcessed += videoUrls.length;
          global.monitorStats.todayCount += videoUrls.length;

          // Upload sonrası delay
          await delay(jitter(BASE_FORWARD_DELAY, 0.3));
          continue; // Bu hedefi atla (zaten upload yaptık), sonraki hedefe geç
        }

        // Circuit breaker kontrolü
        if (!breakerOk()) {
          logger.error(
            '[GROUPED-FORWARD] Circuit breaker aktif, kampanya durduruluyor'
          );
          addActivityLog(
            'error',
            `🚨 Güvenlik durdurma: ${breaker.reason}`
          );
          addJobLog('error', `Circuit breaker aktif: ${breaker.reason}`);

          const stopResult = {
            success: false,
            error: `Circuit breaker aktif: ${breaker.reason}`,
            sentToFirst: firstTarget.name,
            totalVideos: videoUrls.length,
            totalTargets: unifiedTargets.length,
            forwardedTo: forwardedCount,
            failed: totalFailed,
            stopped: true
          };

          finishJob('stopped', stopResult);
          return; // 202 zaten gönderildi, res kullanma
        }

        logger.info(
          `[FORWARD] ${forwardedCount + 1}/${remainingTargets.length}: ${
            target.name
          }`
        );

        try {
          for (let v = 0; v < sentMessages.length; v++) {
            const msg = sentMessages[v];

            // ✅ VALIDATION: Forward öncesi mesaj kontrolü
            if (!msg || !msg.key) {
              logger.error(
                `[FORWARD-SKIP] Mesaj ${
                  v + 1
                } geçersiz (key eksik), atlanıyor`,
                {
                  msgExists: !!msg,
                  hasKey: !!msg?.key,
                  target: target.name
                }
              );
              addActivityLog(
                'warning',
                `Mesaj ${v + 1} geçersiz, atlanıyor (${target.name})`
              );
              continue; // Bu mesajı atla, diğerlerine devam et
            }

            const fwdStart = Date.now();

            // safeSend ile forward (ban detection + retry)
            await safeSend(target.jid, { forward: msg });

            const fwdDuration = Date.now() - fwdStart;
            logger.debug(
              `[FORWARD] Video ${v + 1} forwarded in ${fwdDuration}ms to ${
                target.name
              }`
            );

            // Her video arası jitter delay
            await delay(jitter(BASE_FORWARD_DELAY, 0.25));
          }

          forwardedCount++;
          addActivityLog(
            'success',
            `Forward tamam: ${target.name} (${sentMessages.length} mesaj)`
          );

          // İstatistik
          global.monitorStats.totalProcessed += sentMessages.length;
          global.monitorStats.todayCount += sentMessages.length;

          // Hedef arası ekstra delay
          await delay(jitter(BASE_FORWARD_DELAY, 0.3));
        } catch (forwardError) {
          totalFailed++;

          const isTransient =
            forwardError.message &&
            (forwardError.message.includes('ECONNRESET') ||
              forwardError.message.includes('ETIMEDOUT') ||
              forwardError.message.includes('socket hang up'));

          logger.error('[GROUPED-FORWARD] Forward failed', {
            error: forwardError.message,
            target: target.name,
            targetJid: target.jid,
            isTransient
          });
          addActivityLog(
            'error',
            `Forward hatası: ${target.name} - ${forwardError.message}`
          );
          addJobLog(
            'warning',
            `Hedef başarısız: ${target.name} (${
              isTransient ? 'network error' : 'unknown error'
            })`
          );

          // Ban riski varsa hemen dur
          if (breaker.open) {
            logger.error(
              '[GROUPED-FORWARD] Ban riski tespit edildi, tüm kampanya durduruluyor'
            );
            addJobLog('error', `Ban riski: ${breaker.reason}`);

            clearAllCache();

            const stopResult = {
              success: false,
              error: `Ban riski: ${breaker.reason}`,
              sentToFirst: firstTarget.name,
              totalVideos: videoUrls.length,
              totalTargets: unifiedTargets.length,
              forwardedTo: forwardedCount,
              failed: totalFailed,
              stopped: true
            };

            finishJob('stopped', stopResult);
            return; // 202 zaten gönderildi, res kullanma
          }
        }
      }

      // Chunk tamamlandı - progress güncelle
      const progressPercent =
        Math.round(((chunkIdx + 1) / targetChunks.length) * 90) + 10; // 10-100%
      updateJobProgress(progressPercent);

      // Chunk cooldown
      if (chunkIdx < targetChunks.length - 1) {
        const cooldownTime = jitter(BASE_BURST_COOLDOWN, 0.2);
        logger.info(
          `[CHUNK ${chunkIdx + 1}] Tamamlandı, ${Math.round(
            cooldownTime / 1000
          )}s cooldown...`
        );
        addActivityLog(
          'info',
          `✅ ${currentChunk.length} hedef tamamlandı, ${Math.round(
            cooldownTime / 1000
          )}s bekleniyor...`
        );
        addJobLog(
          'info',
          `Chunk ${chunkIdx + 1}/${targetChunks.length} tamamlandı, cooldown: ${Math.round(
            cooldownTime / 1000
          )}s`
        );
        await delay(cooldownTime);
      }
    }

    // 4) Cache temizle
    clearAllCache();
    logger.info(
      `[GROUPED-FORWARD] Tüm işlemler tamamlandı: ${videoUrls.length} video → ${unifiedTargets.length} hedef (1 send + ${forwardedCount} forward, ${totalFailed} başarısız)`
    );
    addActivityLog(
      'success',
      `✅ Tamamlandı: ${forwardedCount}/${unifiedTargets.length - 1} forward başarılı`
    );

    const processingTime = Date.now() - startTime;
    const processingMinutes = Math.round(processingTime / 1000 / 60);

    const finalStatus = {
      requestId,
      success: true,
      mode: 'baileys-forward-v4-upload-rotation',
      features: [
        'shuffle',
        'jitter',
        'circuit-breaker',
        'chunk-system',
        'safe-send',
        'caption-variation',
        'random-first-contact',
        'upload-rotation'
      ],
      config: {
        chunkSize: CHUNK_SIZE,
        forwardDelay: FORWARD_DELAY,
        burstCooldown: FORWARD_BURST_COOLDOWN,
        uploadPerSize: UPLOAD_PER_SIZE
      },
      sentToFirst: firstTarget.name,
      firstTargetType: firstTarget.type,
      totalVideos: videoUrls.length,
      totalTargets: unifiedTargets.length,
      forwardedTo: forwardedCount,
      failed: totalFailed,
      uploadCount: UPLOAD_PER_SIZE
        ? Math.ceil(unifiedTargets.length / UPLOAD_PER_SIZE)
        : 0,
      successRate: `${Math.round(
        (forwardedCount / (unifiedTargets.length - 1)) * 100
      )}%`,
      processingTime: `${processingMinutes} dakika`,
      circuitBreakerStatus: breaker.open
        ? `⚠️ AÇIK (${breaker.reason})`
        : '✅ Kapalı'
    };

    logger.info('[GROUPED-FORWARD] Success', finalStatus);
    logEndpoint('/send-video-to-contacts-grouped', 'POST', req.body, finalStatus);
    addJobLog(
      'success',
      `Tamamlandı: ${forwardedCount}/${unifiedTargets.length - 1} forward başarılı`
    );
    finishJob('completed', finalStatus);
    updateJobProgress(100);
  } catch (error) {
    // Cache temizle (hata durumunda)
    try {
      clearAllCache();
    } catch {}

    logger.error('[GROUPED-FORWARD] Error', {
      requestId,
      error: error.message,
      stack: error.stack,
      videoUrls: videoUrls?.length
    });

    logEndpoint('/send-video-to-contacts-grouped', 'POST', req.body, {
      requestId,
      error: error.message
    });
    addActivityLog('error', `❌ İşlem hatası: ${error.message}`);
    addJobLog('error', `Fatal error: ${error.message}`);

    finishJob('failed', {
      error: error.message,
      stack: error.stack
    });
  }
});
