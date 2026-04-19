# PatientCase

واجهة React ثنائية اللغة لطلب الاستشارات الطبية من قبل المرضى، مع اختيار التخصص، التحقق من رقم الهاتف، ودعم إرفاق ملفات طبية متعددة.

## التشغيل المحلي

1. أنشئ ملف `.env` من `.env.example`.
2. ضع إعدادات الخادم الخلفي في المتغيرات التالية:
   - `API_REMOTE_BASE_URL`
   - `API_AUTH_HEADER`
   - `API_AUTH_VALUE`
   - `API_BEARER_TOKEN` عند الحاجة فقط
3. شغّل الأوامر التالية:
   - `npm install`
   - `npm run dev`

## لماذا تغيرت المتغيرات؟

المشروع لم يعد يعتمد على `VITE_*` لإرسال التوكن إلى المتصفح. بدلاً من ذلك:
- الواجهة تستدعي مسارات محلية مثل `/api/specialties`
- Vite في التطوير يعمل كـ proxy آمن
- Vercel في الإنتاج يستخدم دوال serverless ضمن مجلد `api`

بهذا يبقى التوكن على الخادم ولا يظهر في JavaScript الخاص بالمتصفح.

## جودة الكود

الأوامر المتاحة:
- `npm run lint`
- `npm run test`
- `npm run build`

## تجهيز الإطلاق

قبل النشر على Vercel تأكد من التالي:
- ضبط المتغيرات: `API_REMOTE_BASE_URL`, `API_AUTH_HEADER`, `API_AUTH_VALUE`
- إضافة `API_BEARER_TOKEN` فقط إذا كان الـ upstream يتطلب Bearer token
- إضافة `UPLOADTHING_PROXY_URL` فقط إذا كان رفع الملفات يجب أن يمر عبر endpoint مختلف عن القيمة الافتراضية
- التحقق من أن مسار `/api/uploadthing` يعمل في بيئة الإنتاج ويرجع استجابات JSON صحيحة
- تنفيذ `npm run lint && npm run test && npm run build` محليًا أو ضمن CI قبل كل نشر

إذا كانت بيئة الإنتاج تستخدم نفس القيم الموجودة في `.env.example` فيمكن نقلها مباشرة إلى Project Settings داخل Vercel بدون أي متغيرات `VITE_*`.

## قيود المرفقات الحالية

- الحد الأقصى: 5 ملفات
- الحجم الأقصى: 5 MB لكل ملف
- الأنواع المسموحة: PDF, JPG, JPEG, PNG, WEBP, DOC, DOCX

المرفقات ما زالت تُحوَّل إلى Base64 لأن هذا هو الشكل الأقرب للعقد الحالي مع الـ webhook. إذا تغيّر العقد الخلفي إلى `multipart/form-data` فيمكن تعديل طبقة الإرسال بسهولة من `src/lib/consultationPayload.js`.
