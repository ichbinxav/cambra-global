import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import process from "node:process";
const read=(p)=>readFileSync(join(process.cwd(),p),"utf8");
describe("public trust — no illustrative testimonials",()=>{
  it("does not mount placeholder testimonials on the landing",()=>{
    const landing=read("src/pages/Landing.jsx");
    expect(landing).not.toContain("TestimonialsCarousel");
    expect(landing).not.toContain('href="#testimonials"');
  });
  it("redirects the historical Testimonials route and removes it from navigation/SEO",()=>{
    const app=read("src/App.jsx"), nav=read("src/components/landing/Navbar.jsx"), mobile=read("src/components/landing/MobileNavMenu.jsx"), seo=read("src/lib/seoConfig.js"), sitemap=read("public/sitemap.xml");
    expect(app).toContain('<Route path="/Testimonials" element={<Navigate to="/" replace />} />');
    expect(nav).not.toContain('href: "/Testimonials"');
    expect(mobile).not.toContain('href: "/Testimonials"');
    expect(seo).not.toContain('"/Testimonials":');
    expect(sitemap).not.toContain('/Testimonials');
  });
});
