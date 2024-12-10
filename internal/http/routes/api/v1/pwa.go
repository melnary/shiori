package api_v1

import (
	"fmt"
	"net/http"
	"net/url"

	"github.com/gin-gonic/gin"
	"github.com/go-shiori/shiori/internal/core"
	"github.com/go-shiori/shiori/internal/dependencies"
	"github.com/go-shiori/shiori/internal/http/middleware"
	"github.com/go-shiori/shiori/internal/http/response"
	"github.com/go-shiori/shiori/internal/model"
	"github.com/sirupsen/logrus"
)

type PWAAPIRoutes struct {
	logger *logrus.Logger
	deps   *dependencies.Dependencies
}

func (r *PWAAPIRoutes) Setup(g *gin.RouterGroup) model.Routes {
	g.Use(middleware.AuthenticationRequired())
	g.POST("/share-target", r.shareTargetHandler)
	return r
}

// @Summary					Bookmark share target for PWA
// @Tags						PWA
// @securityDefinitions.apikey	ApiKeyAuth
// @Produce					json
// @Success					200	{object}	nil	"Succesfully added bookmark"
// @Failure					400	{object}	nil			"Token not provided/invalid"
// @Failure					403	{object}	nil			"Token not provided/invalid"
// @Router						/api/v1/pwa/share_target [post]
func (r *PWAAPIRoutes) shareTargetHandler(c *gin.Context) {
	ctx := c.Request.Context()

	type shareTargetBookmark struct {
		Title string `form:"title"`
		Text  string `form:"text"`
		URL   string `form:"url"`
	}

	var bookmarkPayload shareTargetBookmark
	err := c.Bind(&bookmarkPayload)
	if err != nil {
		response.SendError(c, http.StatusBadRequest, err)
		return
	}

	// When a brower shares a URL, it's common that the form doesn't include all
	// the fields, and the URL is given through the text field.
	// We need to recognize this and move the URL to the correct field.
	if bookmarkPayload.URL == "" {
		if isURLValid(bookmarkPayload.Text) {
			bookmarkPayload.URL = bookmarkPayload.Text
			bookmarkPayload.Text = ""
		} else if isURLValid(bookmarkPayload.Title) {
			bookmarkPayload.URL = bookmarkPayload.Title
			// We do not want to leave the title empty
		}
	}

	// If we're still missing the tile, use the URL again
	if bookmarkPayload.Title == "" {
		bookmarkPayload.Title = bookmarkPayload.URL
	}

	// Clean up share URL
	bookmarkPayload.URL, err = core.RemoveUTMParams(bookmarkPayload.URL)
	if err != nil {
		response.SendError(c, http.StatusBadRequest, err)
		return
	}

	book := &model.BookmarkDTO{
		URL:     bookmarkPayload.URL,
		Title:   bookmarkPayload.Title,
		Excerpt: bookmarkPayload.Text,
		Tags:    []model.Tag{},
	}

	// Save bookmark to database
	results, err := r.deps.Database.SaveBookmarks(ctx, true, *book)
	if err != nil || len(results) == 0 {
		panic(fmt.Errorf("failed to save bookmark: %v", err))
	}

	// Send success response
	response.Send(c, http.StatusOK, nil)
}

func NewPWAAPIRoutes(logger *logrus.Logger, deps *dependencies.Dependencies) *PWAAPIRoutes {
	return &PWAAPIRoutes{
		logger: logger,
		deps:   deps,
	}
}

func isURLValid(rawURL string) bool {
	parsedURL, err := url.Parse(rawURL)
	return err == nil && parsedURL.Scheme != "" && parsedURL.Hostname() != ""
}
