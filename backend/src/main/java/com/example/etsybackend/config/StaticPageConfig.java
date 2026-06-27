package com.example.etsybackend.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ViewControllerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class StaticPageConfig implements WebMvcConfigurer {
    @Override
    public void addViewControllers(ViewControllerRegistry registry) {
        registry.addViewController("/pricing").setViewName("forward:/pricing/index.html");
        registry.addViewController("/terms").setViewName("forward:/terms/index.html");
        registry.addViewController("/privacy").setViewName("forward:/privacy/index.html");
        registry.addViewController("/refund").setViewName("forward:/refund/index.html");
    }
}
